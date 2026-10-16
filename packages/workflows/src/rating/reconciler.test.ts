import type { ReadRequestResult } from "@verisci/contracts";
import { Inngest } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  createReconciler,
  findStaleRequests,
  RECONCILER_SETTINGS,
  type ReconcilerDeps,
  type ReconcilerSteps,
  runReconciler,
} from "./reconciler.ts";

const HOUR = 3_600_000;
const NOW = 1_791_900_000_000;
const CURRENT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const PAST = "0x1111111111111111111111111111111111111111";
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

/** A fake environment: each contract's pending ids with their age in ms. */
function deps(
  pending: Record<string, readonly (readonly [Hex, number])[]>,
  overrides: Partial<ReconcilerDeps> = {},
) {
  const warn = vi.fn();
  const io: ReconcilerDeps = {
    contracts: Object.keys(pending),
    readPendingCount: async (contract) => ({ ok: true, count: pending[contract]?.length ?? 0 }),
    readPendingIds: async (contract, offset, limit) => ({
      ok: true,
      ids: (pending[contract] ?? []).slice(offset, offset + limit).map(([requestId]) => requestId),
    }),
    readRequest: async (contract, requestId): Promise<ReadRequestResult> => {
      const age = pending[contract]?.find(([found]) => found === requestId)?.[1] ?? 0;
      return {
        ok: true,
        request: {
          status: "pending",
          cancelReason: "none",
          requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
          requestedAt: Math.floor((NOW - age) / 1000),
          score: 0,
          targetUal: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7",
          rKaUal: "",
        },
      };
    },
    logger: { warn },
    ...overrides,
  };
  return { io, warn };
}

const windowOf = (now: number) => Math.floor(now / RECONCILER_SETTINGS.thresholdMs);

describe("findStaleRequests", () => {
  it("restarts only requests pending longer than the threshold, on every contract", async () => {
    const { io } = deps({
      [CURRENT]: [
        [id(1), 5 * HOUR],
        [id(2), 3 * HOUR],
      ],
      [PAST]: [[id(3), 10 * 60_000]],
    });

    expect(await findStaleRequests(io, NOW)).toEqual([
      {
        name: "verisci/rating.requested",
        id: `rating:${id(1)}:${windowOf(NOW)}`,
        data: { contract: CURRENT, requestId: id(1) },
      },
    ]);
  });

  it("gives every tick of one 4-hour window the same event ids, so a request restarts once", async () => {
    const { io } = deps({ [PAST]: [[id(1), 9 * HOUR]] });
    const start = windowOf(NOW) * RECONCILER_SETTINGS.thresholdMs;

    const first = await findStaleRequests(io, start + 1);
    const second = await findStaleRequests(io, start + 30 * 60_000);
    const next = await findStaleRequests(io, start + RECONCILER_SETTINGS.thresholdMs);

    expect(first.map((event) => event.id)).toEqual(second.map((event) => event.id));
    expect(next[0]?.id).not.toBe(first[0]?.id);
  });

  it("reads one page per contract a tick, at page tick mod pages, so ticks reach every request", async () => {
    const { pageSize, intervalMs } = RECONCILER_SETTINGS;
    const stale = Array.from(
      { length: pageSize * 2 + 50 },
      (_, n) => [id(n + 1), 5 * HOUR] as const,
    );
    const { io } = deps({ [CURRENT]: stale });
    const tick = Math.floor(NOW / intervalMs);

    const ticks = await Promise.all(
      [0, 1, 2].map((later) => findStaleRequests(io, NOW + later * intervalMs)),
    );

    for (const events of ticks) expect(events.length).toBeLessThanOrEqual(pageSize);
    expect(ticks[0]?.[0]?.data.requestId).toBe(id((tick % 3) * pageSize + 1));
    expect(new Set(ticks.flat().map((event) => event.data.requestId)).size).toBe(stale.length);
  });

  it("still reconciles the other contracts when one doesn't answer, and logs it", async () => {
    const { io, warn } = deps(
      { [CURRENT]: [[id(1), 5 * HOUR]], [PAST]: [[id(2), 5 * HOUR]] },
      {
        readPendingCount: async (contract) =>
          contract === CURRENT ? { ok: false, reason: "unreachable" } : { ok: true, count: 1 },
      },
    );

    expect((await findStaleRequests(io, NOW)).map((event) => event.data.requestId)).toEqual([
      id(2),
    ]);
    expect(warn).toHaveBeenCalledWith(`reconcile-unreachable: ${CURRENT}`);
  });

  it("skips a request it can't read, and logs how many, or one settled since the page was read", async () => {
    const { io, warn } = deps(
      {
        [CURRENT]: [
          [id(1), 5 * HOUR],
          [id(2), 5 * HOUR],
        ],
      },
      {
        readRequest: async (_, requestId) =>
          requestId === id(1)
            ? { ok: false, reason: "unreachable" }
            : {
                ok: true,
                request: {
                  status: "fulfilled",
                  cancelReason: "none",
                  requester: "0x9a",
                  requestedAt: Math.floor((NOW - 5 * HOUR) / 1000),
                  score: 70,
                  targetUal: "x",
                  rKaUal: "y",
                },
              },
      },
    );

    expect(await findStaleRequests(io, NOW)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(`reconcile-unreadable: ${CURRENT}: 1 of 2 requests`);
  });
});

/** Steps that run at once and record every step id and the events sent. */
function fakeSteps() {
  const log: string[] = [];
  const sent: unknown[] = [];
  const step: ReconcilerSteps = {
    async run(id, fn) {
      log.push(id);
      return fn();
    },
    async sendEvent(id, events) {
      log.push(id);
      sent.push(...events);
    },
  };
  return { step, log, sent };
}

describe("runReconciler", () => {
  it("sends every restart event from one step", async () => {
    const { io } = deps({ [CURRENT]: [[id(1), 5 * HOUR]], [PAST]: [[id(2), 5 * HOUR]] });
    const { step, log, sent } = fakeSteps();

    expect(
      await runReconciler(
        step,
        () => io,
        () => NOW,
      ),
    ).toEqual({ restarted: 2 });
    expect(log).toEqual(["find-stale", "restart"]);
    expect(sent).toEqual(await findStaleRequests(io, NOW));
  });

  it("sends nothing when no request is stale", async () => {
    const { io } = deps({ [CURRENT]: [[id(1), HOUR]] });
    const { step, log } = fakeSteps();

    expect(
      await runReconciler(
        step,
        () => io,
        () => NOW,
      ),
    ).toEqual({ restarted: 0 });
    expect(log).toEqual(["find-stale"]);
  });
});

describe("createReconciler", () => {
  it("runs every 30 minutes, a singleton that skips a tick while the last one runs", () => {
    const fn = createReconciler(new Inngest({ id: "verisci-test" }), () => deps({}).io);

    expect(fn.opts.id).toBe("reconcile-ratings");
    expect(fn.opts.triggers).toEqual([{ cron: "*/30 * * * *" }]);
    expect(fn.opts.singleton).toEqual({ mode: "skip" });
  });
});
