import type { Inngest } from "inngest";
import { formatEther, type Hex } from "viem";
import { type PendingReads, readPending } from "../rating/pending.ts";

/** The hourly health check's settings and thresholds (ADRs 0015, 0019, 0038). */
export const HEALTH_SETTINGS = {
  /** Every hour: about 720 runs a month, against Inngest's free 50,000 executions. */
  cron: "0 * * * *",
  /**
   * Below this, a wallet is alerted on: 0.005 ETH is hundreds of oracle transactions or
   * publishes on Base Sepolia, a few days' warning.
   */
  minEthWei: 5n * 10n ** 15n,
  /** Below this, a publisher wallet is alerted on: 100 TRAC. */
  minTracWei: 100n * 10n ** 18n,
  /**
   * A request pending longer is alerted on: past the reconciler's 4-hour threshold and its
   * interval, it should have been restarted and settled.
   */
  oldestPendingMs: 6 * 3_600_000,
  /** Pending ids read per call. */
  pageSize: 100,
  /**
   * Pages of pending ids read per contract an hour, each hour going on from the last: all of
   * them up to 300 pending requests, and past that a spam backlog in turns, so a check never
   * reads more than 300 requests (`readPending` reads them 10 at a time).
   */
  pagesPerHour: 3,
} as const;

/** The reads the health check makes; tests pass fakes. */
export interface HealthDeps extends PendingReads {
  /** The oracle's address, lowercase (ADR 0019). */
  readonly oracle: string;
  /** The DKG node's publisher wallets, lowercase. */
  readonly publishers: readonly string[];
  /** The environment's contracts, lowercase. */
  readonly contracts: readonly string[];
  /** An address's ETH in wei, `undefined` when the chain did not answer. */
  readEth(address: string): Promise<bigint | undefined>;
  /** An address's TRAC in its smallest unit, `undefined` when the chain did not answer. */
  readTrac(address: string): Promise<bigint | undefined>;
  readonly logger: { warn(message: string): void };
}

/** The step tool a health check uses; tests pass a fake. */
export interface HealthSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * What needs the maintainer, one line each: the oracle or a publisher wallet under its ETH
 * threshold, a publisher wallet under its TRAC threshold, and requests pending past
 * `oldestPendingMs` (how many, the oldest, and how many were read when a backlog is read in
 * turns). A balance that does not answer is left for the next hour; a contract is logged
 * `health-unreachable`, and requests that do not answer `health-unreadable` with their number.
 * An empty list means all is well.
 */
export async function healthProblems(deps: HealthDeps, nowMs: number): Promise<string[]> {
  const { minEthWei, minTracWei } = HEALTH_SETTINGS;
  const wallets = [
    { role: "oracle", address: deps.oracle, trac: false },
    ...deps.publishers.map((address) => ({ role: "publisher", address, trac: true })),
  ];
  const balances = await Promise.all(
    wallets.map(async (wallet) => ({
      ...wallet,
      eth: await deps.readEth(wallet.address),
      tracWei: wallet.trac ? await deps.readTrac(wallet.address) : undefined,
    })),
  );
  const problems: string[] = [];
  for (const { role, address, eth, tracWei } of balances) {
    if (eth !== undefined && eth < minEthWei) {
      problems.push(
        `${role} ${address} holds ${formatEther(eth)} ETH, under ${formatEther(minEthWei)}`,
      );
    }
    if (tracWei !== undefined && tracWei < minTracWei) {
      problems.push(
        `${role} ${address} holds ${formatEther(tracWei)} TRAC, under ${formatEther(minTracWei)}`,
      );
    }
  }
  const { old, read, count } = await oldPending(deps, nowMs);
  const oldest = old[0];
  if (oldest) {
    const hours = Math.floor((nowMs - oldest.requestedAt * 1000) / 3_600_000);
    const sampled = read < count ? ` (${read} of the ${count} pending read this hour)` : "";
    problems.push(
      `${old.length} rating requests pending over ${HEALTH_SETTINGS.oldestPendingMs / 3_600_000} h; the oldest, ${oldest.requestId} on ${oldest.contract}, for ${hours} h${sampled}`,
    );
  }
  return problems;
}

/**
 * The requests read this hour that are pending past `oldestPendingMs`, on every contract, the
 * oldest first, with how many were read and how many are pending.
 */
async function oldPending(deps: HealthDeps, nowMs: number) {
  const { oldestPendingMs } = HEALTH_SETTINGS;
  const found = await Promise.all(
    deps.contracts.map(async (contract) => {
      const { ids, count } = await idsThisHour(deps, contract as Hex, nowMs);
      const { pending, unreadable } = await readPending(deps, contract as Hex, ids);
      if (unreadable > 0) {
        deps.logger.warn(`health-unreadable: ${contract}: ${unreadable} of ${ids.length} requests`);
      }
      return { pending: pending.map((request) => ({ ...request, contract })), ids, count };
    }),
  );
  return {
    old: found
      .flatMap(({ pending }) => pending)
      .filter((request) => nowMs - request.requestedAt * 1000 > oldestPendingMs)
      .sort((a, b) => a.requestedAt - b.requestedAt),
    read: found.reduce((sum, { ids }) => sum + ids.length, 0),
    count: found.reduce((sum, { count }) => sum + count, 0),
  };
}

/**
 * The pending ids a contract's check reads this hour: `pagesPerHour` pages, the first after
 * the last hour's, so a backlog of more is read in turns; none, logged, when it does not answer.
 */
async function idsThisHour(deps: HealthDeps, contract: Hex, nowMs: number) {
  const { pageSize, pagesPerHour } = HEALTH_SETTINGS;
  const count = await deps.readPendingCount(contract);
  if (!count.ok) {
    deps.logger.warn(`health-unreachable: ${contract}`);
    return { ids: [], count: 0 };
  }
  const pages = Math.ceil(count.count / pageSize);
  const hour = Math.floor(nowMs / 3_600_000);
  const ids: Hex[] = [];
  for (let n = 0; n < Math.min(pages, pagesPerHour); n += 1) {
    const page = (hour * pagesPerHour + n) % pages;
    const read = await deps.readPendingIds(contract, page * pageSize, pageSize);
    if (!read.ok) {
      deps.logger.warn(`health-unreachable: ${contract}`);
      break;
    }
    ids.push(...read.ids);
  }
  return { ids, count: count.count };
}

/**
 * The `check-health` Inngest cron: every hour, reads the balances and the pending requests
 * and, when something needs the maintainer, sends one alert listing it (ADR 0038). `getDeps`
 * builds the reads on the first run, so importing the function validates no settings.
 */
export function createHealthCheck(
  inngest: Inngest.Any,
  getDeps: () => HealthDeps,
  alert: (text: string) => Promise<void>,
) {
  return inngest.createFunction(
    { id: "check-health", triggers: [{ cron: HEALTH_SETTINGS.cron }], singleton: { mode: "skip" } },
    async ({ step }) =>
      runHealthCheck({ run: (id, fn) => step.run(id, fn) as never }, getDeps, alert, () =>
        Date.now(),
      ),
  );
}

/**
 * One health check: finds the problems in a step (`check`), reading the time inside it, and
 * sends them as one alert from another (`alert`), only when there are some.
 */
export async function runHealthCheck(
  step: HealthSteps,
  getDeps: () => HealthDeps,
  alert: (text: string) => Promise<void>,
  now: () => number,
): Promise<{ readonly problems: number }> {
  const problems = await step.run("check", () => healthProblems(getDeps(), now()));
  if (problems.length > 0) {
    await step.run("alert", () => alert(problems.join("\n")).then(() => null));
  }
  return { problems: problems.length };
}
