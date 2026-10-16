import type {
  ReadPendingCountResult,
  ReadRequestIdsResult,
  ReadRequestResult,
} from "@verisci/contracts";
import type { Inngest } from "inngest";
import type { Hex } from "viem";
import { RATING_REQUESTED, type RatingRequested } from "./events.ts";

/** The reconciler's settings (ADR 0020). */
export const RECONCILER_SETTINGS = {
  /** Every 30 minutes: about 1,500 ticks a month, against Inngest's free 50,000 executions. */
  cron: "*/30 * * * *",
  intervalMs: 30 * 60_000,
  /**
   * A request pending longer than this is restarted. A run waits up to about 2 hours on a
   * Gemini outage (`RATING_SETTINGS.retryWaits`); 4 hours restarts one that gave up without
   * firing while it still runs, and leaves about 5 runs before the 24-hour maximum age.
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
export interface ReconcilerDeps {
  /** The environment's contracts, lowercase: current and past (ADR 0023), or Anvil's locally. */
  readonly contracts: readonly string[];
  readPendingCount(contract: Hex): Promise<ReadPendingCountResult>;
  readPendingIds(contract: Hex, offset: number, limit: number): Promise<ReadRequestIdsResult>;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
  readonly logger: { warn(message: string): void };
}

/**
 * The requests to restart at `nowMs`: on each contract, one page of the pending set, page
 * `tick mod pages` (`tick` counting `intervalMs` periods), so successive ticks reach every
 * request without a stored cursor; of those, each still pending longer than `thresholdMs`. The
 * event id carries the 4-hour window, `rating:<requestId>:<window>`, so every tick of a window
 * sends the same id and Inngest starts at most one run per request per window, whatever the
 * throttle does with queued runs; the singleton keeps it off a run still going. A contract
 * that does not answer is logged `reconcile-unreachable` and left for the next tick; a request
 * that cannot be read, or settled since its page was read, is skipped.
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
      const reads = await Promise.all(
        ids.ids.map(async (requestId) => ({
          requestId,
          read: await deps.readRequest(address, requestId),
        })),
      );
      return reads.flatMap(({ requestId, read }): RestartEvent[] => {
        if (!read.ok || read.request.status !== "pending") return [];
        if (nowMs - read.request.requestedAt * 1000 <= thresholdMs) return [];
        return [
          {
            name: RATING_REQUESTED,
            id: `rating:${requestId}:${window}`,
            data: { contract, requestId },
          },
        ];
      });
    }),
  );
  return perContract.flat();
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
    async ({ step }) => {
      const events = await step.run("find-stale", () => findStaleRequests(getDeps(), Date.now()));
      if (events.length > 0)
        await step.sendEvent(
          "restart",
          events.map((event) => ({ ...event })),
        );
      return { restarted: events.length };
    },
  );
}
