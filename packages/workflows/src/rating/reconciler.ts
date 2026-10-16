import type { Inngest } from "inngest";
import type { Hex } from "viem";
import { RATING_REQUESTED, type RatingRequested } from "./events.ts";
import { type PendingReads, readPending } from "./pending.ts";

/** The reconciler's settings (ADR 0020). */
export const RECONCILER_SETTINGS = {
  /** Every 30 minutes: about 1,500 ticks a month, against Inngest's free 50,000 executions. */
  cron: "*/30 * * * *",
  intervalMs: 30 * 60_000,
  /**
   * A request pending longer than this is restarted. A run waits up to about 2 hours on a
   * Gemini outage (`RATING_SETTINGS.retryWaits`) within its 300-minute budget; a restart that
   * finds it still running is skipped, and the next window sends it again. 4 hours leaves
   * about 5 windows before the 24-hour maximum age.
   */
  thresholdMs: 4 * 3_600_000,
  /** Pending ids read per contract per tick: one `pendingRequestIds` call. */
  pageSize: 100,
} as const;

/** One restart event, for `step.sendEvent`. */
export interface RestartEvent {
  readonly name: typeof RATING_REQUESTED;
  readonly id: string;
  readonly data: RatingRequested;
}

/** The reads the reconciler makes; tests pass fakes. It never writes (ADR 0020). */
export interface ReconcilerDeps extends PendingReads {
  /** The environment's contracts, lowercase: current and past (ADR 0023), or Anvil's locally. */
  readonly contracts: readonly string[];
  readonly logger: { warn(message: string): void };
}

/** The step tools a reconciler tick uses; tests pass fakes. */
export interface ReconcilerSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sendEvent(id: string, events: RestartEvent[]): Promise<unknown>;
}

/**
 * The requests to restart at `nowMs`: on each contract, one page of the pending set, page
 * `tick mod pages` (`tick` counting `intervalMs` periods), so successive ticks reach every
 * request without a stored cursor; of those, each still pending longer than `thresholdMs`. The
 * event id carries the 4-hour window, `rating:<requestId>:<window>`, so every tick of a window
 * sends the same id and Inngest starts at most one run per request per window, whatever the
 * throttle does with queued runs; the singleton keeps it off a run still going, and the next
 * window sends it again. A contract that does not answer is logged `reconcile-unreachable` and
 * left for the next tick; requests are read 10 at a time (`readPending`), and those that do
 * not answer are logged `reconcile-unreadable` with their number and skipped, as is one
 * settled since its page was read.
 */
export async function findStaleRequests(
  deps: ReconcilerDeps,
  nowMs: number,
): Promise<RestartEvent[]> {
  const { pageSize, intervalMs, thresholdMs } = RECONCILER_SETTINGS;
  const tick = Math.floor(nowMs / intervalMs);
  const window = Math.floor(nowMs / thresholdMs);
  const perContract = await Promise.all(
    deps.contracts.map(async (contract) => {
      const address = contract as Hex;
      const count = await deps.readPendingCount(address);
      if (!count.ok) {
        deps.logger.warn(`reconcile-unreachable: ${contract}`);
        return [];
      }
      if (count.count === 0) return [];
      const page = tick % Math.ceil(count.count / pageSize);
      const ids = await deps.readPendingIds(address, page * pageSize, pageSize);
      if (!ids.ok) {
        deps.logger.warn(`reconcile-unreachable: ${contract}`);
        return [];
      }
      const { pending, unreadable } = await readPending(deps, address, ids.ids);
      if (unreadable > 0) {
        deps.logger.warn(
          `reconcile-unreadable: ${contract}: ${unreadable} of ${ids.ids.length} requests`,
        );
      }
      return pending.flatMap(({ requestId, requestedAt }): RestartEvent[] =>
        nowMs - requestedAt * 1000 > thresholdMs
          ? [
              {
                name: RATING_REQUESTED,
                id: `rating:${requestId}:${window}`,
                data: { contract, requestId },
              },
            ]
          : [],
      );
    }),
  );
  return perContract.flat();
}

/**
 * One reconciler tick: finds the stale requests in a step (`find-stale`), reading the time
 * inside it, and sends their restart events from another (`restart`), only when there are some.
 */
export async function runReconciler(
  step: ReconcilerSteps,
  getDeps: () => ReconcilerDeps,
  now: () => number,
): Promise<{ readonly restarted: number }> {
  const events = await step.run("find-stale", () => findStaleRequests(getDeps(), now()));
  if (events.length > 0) await step.sendEvent("restart", events);
  return { restarted: events.length };
}

/**
 * The `reconcile-ratings` Inngest cron (ADR 0020): every 30 minutes, restarts each request
 * pending past the threshold by sending its rating event again; the rating run decides what is
 * left to do. A singleton, so a slow tick never overlaps the next. `getDeps` builds the reads on
 * the first tick, so importing the function validates no settings.
 */
export function createReconciler(inngest: Inngest.Any, getDeps: () => ReconcilerDeps) {
  return inngest.createFunction(
    {
      id: "reconcile-ratings",
      triggers: [{ cron: RECONCILER_SETTINGS.cron }],
      singleton: { mode: "skip" },
    },
    async ({ step }) =>
      runReconciler(
        {
          run: (id, fn) => step.run(id, fn) as never,
          sendEvent: (id, events) =>
            step.sendEvent(
              id,
              events.map((event) => ({ ...event })),
            ),
        },
        getDeps,
        () => Date.now(),
      ),
  );
}
