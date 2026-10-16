import type {
  ReadPendingCountResult,
  ReadRequestIdsResult,
  ReadRequestResult,
} from "@verisci/contracts";
import type { Inngest } from "inngest";
import { formatEther, type Hex } from "viem";

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
} as const;

/** The reads the health check makes; tests pass fakes. */
export interface HealthDeps {
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
  readPendingCount(contract: Hex): Promise<ReadPendingCountResult>;
  readPendingIds(contract: Hex, offset: number, limit: number): Promise<ReadRequestIdsResult>;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
}

/**
 * What needs the maintainer, one line each: the oracle or a publisher wallet under its ETH
 * threshold, a publisher wallet under its TRAC threshold, and requests pending past
 * `oldestPendingMs` (how many, and the oldest). A balance or contract that does not answer is
 * left for the next hour; an empty list means all is well.
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
  const old = await oldPending(deps, nowMs);
  const oldest = old[0];
  if (oldest) {
    const hours = Math.floor((nowMs - oldest.requestedAt * 1000) / 3_600_000);
    problems.push(
      `${old.length} rating requests pending over ${HEALTH_SETTINGS.oldestPendingMs / 3_600_000} h; the oldest, ${oldest.requestId} on ${oldest.contract}, for ${hours} h`,
    );
  }
  return problems;
}

/** Every request pending past `oldestPendingMs` on every contract, the oldest first. */
async function oldPending(deps: HealthDeps, nowMs: number) {
  const { pageSize, oldestPendingMs } = HEALTH_SETTINGS;
  const found = await Promise.all(
    deps.contracts.map(async (contract) => {
      const address = contract as Hex;
      const count = await deps.readPendingCount(address);
      if (!count.ok) return [];
      const pages = await Promise.all(
        Array.from({ length: Math.ceil(count.count / pageSize) }, (_, page) =>
          deps.readPendingIds(address, page * pageSize, pageSize),
        ),
      );
      const ids = pages.flatMap((page) => (page.ok ? page.ids : []));
      const reads = await Promise.all(ids.map((requestId) => deps.readRequest(address, requestId)));
      return reads.flatMap((read, index) =>
        read.ok && read.request.status === "pending"
          ? [{ contract, requestId: ids[index] ?? "", requestedAt: read.request.requestedAt }]
          : [],
      );
    }),
  );
  return found
    .flat()
    .filter((request) => nowMs - request.requestedAt * 1000 > oldestPendingMs)
    .sort((a, b) => a.requestedAt - b.requestedAt);
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
    async ({ step }) => {
      const problems = await step.run("check", () => healthProblems(getDeps(), Date.now()));
      if (problems.length > 0) {
        await step.run("alert", () => alert(problems.join("\n")).then(() => null));
      }
      return { problems: problems.length };
    },
  );
}
