import type { ReadRequestResult } from "@verisci/contracts";
import { Inngest } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  createHealthCheck,
  HEALTH_SETTINGS,
  type HealthDeps,
  healthProblems,
  runHealthCheck,
} from "./health.ts";

const HOUR = 3_600_000;
const NOW = 1_791_900_000_000;
const ETH = 10n ** 18n;
const ORACLE = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const PUBLISHER = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const CONTRACT = "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90";
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

function deps(
  state: {
    eth?: Record<string, bigint | undefined>;
    trac?: Record<string, bigint | undefined>;
    pending?: readonly (readonly [Hex, number])[];
  },
  overrides: Partial<HealthDeps> = {},
): HealthDeps {
  const pending = state.pending ?? [];
  const eth: Record<string, bigint | undefined> = { [ORACLE]: ETH, [PUBLISHER]: ETH, ...state.eth };
  const trac: Record<string, bigint | undefined> = { [PUBLISHER]: 900n * ETH, ...state.trac };
  return {
    oracle: ORACLE,
    publishers: [PUBLISHER],
    contracts: [CONTRACT],
    readEth: async (address) => eth[address],
    readTrac: async (address) => trac[address],
    readPendingCount: async () => ({ ok: true, count: pending.length }),
    readPendingIds: async (_, offset, limit) => ({
      ok: true,
      ids: pending.slice(offset, offset + limit).map(([requestId]) => requestId),
    }),
    readRequest: async (_, requestId): Promise<ReadRequestResult> => ({
      ok: true,
      request: {
        status: "pending",
        cancelReason: "none",
        requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        requestedAt: Math.floor(
          (NOW - (pending.find(([found]) => found === requestId)?.[1] ?? 0)) / 1000,
        ),
        score: 0,
        targetUal: "x",
        rKaUal: "",
      },
    }),
    logger: { warn: vi.fn() },
    ...overrides,
  };
}

describe("healthProblems", () => {
  it("finds nothing when every balance is above its threshold and no request is old", async () => {
    expect(await healthProblems(deps({ pending: [[id(1), HOUR]] }), NOW)).toEqual([]);
  });

  it("names the oracle and each publisher wallet under their ETH threshold, and TRAC under its own", async () => {
    const low = HEALTH_SETTINGS.minEthWei - 1n;

    expect(
      await healthProblems(
        deps({ eth: { [ORACLE]: low, [PUBLISHER]: low }, trac: { [PUBLISHER]: 42n * ETH } }),
        NOW,
      ),
    ).toEqual([
      `oracle ${ORACLE} holds 0.004999999999999999 ETH, under 0.005`,
      `publisher ${PUBLISHER} holds 0.004999999999999999 ETH, under 0.005`,
      `publisher ${PUBLISHER} holds 42 TRAC, under 100`,
    ]);
  });

  it("names how many requests are pending past 6 hours, and the oldest", async () => {
    const problems = await healthProblems(
      deps({
        pending: [
          [id(1), 7 * HOUR],
          [id(2), 9 * HOUR],
          [id(3), HOUR],
        ],
      }),
      NOW,
    );

    expect(problems).toEqual([
      `2 rating requests pending over 6 h; the oldest, ${id(2)} on ${CONTRACT}, for 9 h`,
    ]);
  });

  it("says nothing of a balance it couldn't read: the next hour reads it again", async () => {
    expect(await healthProblems(deps({ eth: { [ORACLE]: undefined } }), NOW)).toEqual([]);
  });

  it("reads at most 3 pages a contract an hour, going on from the last hour's, and says how many it read", async () => {
    const { pageSize, pagesPerHour } = HEALTH_SETTINGS;
    const old = Array.from({ length: pageSize * 5 }, (_, n) => [id(n + 1), 7 * HOUR] as const);
    const offsets: number[] = [];
    const io = deps({ pending: old });
    const counted: HealthDeps = {
      ...io,
      readPendingIds: (contract, offset, limit) => {
        offsets.push(offset);
        return io.readPendingIds(contract, offset, limit);
      },
    };

    const problems = await healthProblems(counted, NOW);
    await healthProblems(counted, NOW + HOUR);

    expect(offsets).toHaveLength(2 * pagesPerHour);
    expect(new Set(offsets)).toEqual(new Set([0, 1, 2, 3, 4].map((page) => page * pageSize)));
    expect(problems).toEqual([
      `300 rating requests pending over 6 h; the oldest, ${id((offsets[0] ?? 0) + 1)} on ${CONTRACT}, for 7 h (300 of the 500 pending read this hour)`,
    ]);
  });

  it("logs a contract it couldn't reach, and how many requests didn't answer", async () => {
    const reachable = deps({
      pending: [
        [id(1), 7 * HOUR],
        [id(2), 7 * HOUR],
      ],
    });
    const unreachable = deps(
      {},
      { readPendingCount: async () => ({ ok: false, reason: "unreachable" }) },
    );
    const partial = deps(
      {},
      {
        readRequest: async (contract, requestId) =>
          requestId === id(1)
            ? { ok: false, reason: "unreachable" }
            : reachable.readRequest(contract, requestId),
        readPendingCount: reachable.readPendingCount,
        readPendingIds: reachable.readPendingIds,
      },
    );

    await healthProblems(unreachable, NOW);
    const problems = await healthProblems(partial, NOW);

    expect(unreachable.logger.warn).toHaveBeenCalledWith(`health-unreachable: ${CONTRACT}`);
    expect(partial.logger.warn).toHaveBeenCalledWith(
      `health-unreadable: ${CONTRACT}: 1 of 2 requests`,
    );
    expect(problems).toEqual([
      `1 rating requests pending over 6 h; the oldest, ${id(2)} on ${CONTRACT}, for 7 h`,
    ]);
  });
});

/** A step that runs at once and records its id. */
function fakeStep() {
  const log: string[] = [];
  return {
    log,
    step: {
      async run<T>(stepId: string, fn: () => Promise<T>) {
        log.push(stepId);
        return fn();
      },
    },
  };
}

describe("runHealthCheck", () => {
  it("sends nothing when all is well", async () => {
    const { step, log } = fakeStep();
    const alert = vi.fn(async (_text: string) => {});

    expect(
      await runHealthCheck(
        step,
        () => deps({}),
        alert,
        () => NOW,
      ),
    ).toEqual({ problems: 0 });
    expect(log).toEqual(["check"]);
    expect(alert).not.toHaveBeenCalled();
  });

  it("sends one alert, from a step of its own, listing every problem", async () => {
    const { step, log } = fakeStep();
    const alert = vi.fn(async (_text: string) => {});
    const low = HEALTH_SETTINGS.minEthWei - 1n;

    await runHealthCheck(
      step,
      () => deps({ eth: { [ORACLE]: low }, pending: [[id(1), 7 * HOUR]] }),
      alert,
      () => NOW,
    );

    expect(log).toEqual(["check", "alert"]);
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      `oracle ${ORACLE} holds 0.004999999999999999 ETH, under 0.005\n1 rating requests pending over 6 h; the oldest, ${id(1)} on ${CONTRACT}, for 7 h`,
    );
  });
});

describe("createHealthCheck", () => {
  it("runs every hour, a singleton that skips an hour while the last check runs", () => {
    const fn = createHealthCheck(
      new Inngest({ id: "verisci-test" }),
      () => deps({}),
      async () => {},
    );

    expect(fn.opts.id).toBe("check-health");
    expect(fn.opts.triggers).toEqual([{ cron: HEALTH_SETTINGS.cron }]);
    expect(fn.opts.singleton).toEqual({ mode: "skip" });
  });
});
