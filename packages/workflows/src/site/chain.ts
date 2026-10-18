import { type Chain, createPublicClient, http } from "viem";

/**
 * How the site's pages read the chain. A page of papers reads each paper of every contract at
 * once, a burst RPC endpoints refuse (Base's public endpoint; Alchemy RPC's free tier, about
 * 19 `eth_call`s a second, `docs/domain.md` → Chain), so the contract reads made together go
 * out as one Multicall3 call.
 */
export const SITE_CHAIN_SETTINGS = {
  /** How long one call gets. */
  timeoutMs: 5_000,
  /** Tries after the first, for a call refused (429) or failed: one, so a page waits little. */
  retryCount: 1,
  /**
   * The wait before the retry: a refused burst is served again within the next second. A 429
   * carrying `Retry-After` is waited out for that long instead (viem's rule).
   */
  retryDelayMs: 1_000,
  /**
   * The calldata one Multicall3 call carries, past which viem starts another (its default is
   * 1,024 bytes, about 6 reads of a UAL): a page of 20 papers on 3 contracts is about 10 KB.
   */
  multicallBytes: 32_768,
} as const;

/**
 * The site's chain client for `chain` at `url`: contract reads made in the same tick share one
 * Multicall3 `aggregate3` call (on a chain without Multicall3, such as Anvil, each is its own
 * call), each call gets `timeoutMs`, and a failed one is asked once more after `retryDelayMs`.
 * A call with no contract address, such as a smart wallet's signature check (ERC-6492), is
 * sent on its own. `fetchFn` stands in for `fetch` in tests.
 */
export function createSiteChainClient(chain: Chain, url: string, fetchFn?: typeof fetch) {
  const { timeoutMs, retryCount, retryDelayMs, multicallBytes } = SITE_CHAIN_SETTINGS;
  return createPublicClient({
    chain,
    batch: { multicall: { batchSize: multicallBytes } },
    transport: http(url, {
      timeout: timeoutMs,
      retryCount,
      retryDelay: retryDelayMs,
      ...(fetchFn ? { fetchFn } : {}),
    }),
  });
}
