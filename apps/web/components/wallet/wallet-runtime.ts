import { createAppKit } from "@reown/appkit";
import { type AppKitNetwork, baseSepolia, foundry } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  getAccount,
  type SignTypedDataParameters,
  signTypedData,
  switchChain,
  type WaitForTransactionReceiptReturnType,
  type WriteContractParameters,
  waitForTransactionReceipt,
  watchAccount,
  writeContract,
} from "wagmi/actions";
import { SITE } from "../../lib/site.ts";
import type { WalletAccount } from "../../lib/wallet/store.ts";

/** What the page hands the wallet: the Reown project id, Anvil's URL locally, and the theme. */
export interface WalletSettings {
  readonly projectId: string;
  /** Anvil's URL, set only with `APP_ENV=local`, for requesting ratings there (ADR 0036). */
  readonly localRpcUrl?: string | undefined;
  readonly theme: "light" | "dark";
}

/** The wallet, once loaded: AppKit's window and wagmi's actions on one config. */
export interface WalletRuntime {
  /** The connected account, or undefined. */
  account(): WalletAccount | undefined;
  /** Calls `listener` when the account, its chain or the connection changes. */
  subscribe(listener: () => void): () => void;
  /** Opens AppKit's window: to connect, or the account's view once connected. */
  open(): Promise<void>;
  switchChain(chainId: number): Promise<void>;
  signTypedData(request: SignTypedDataParameters): Promise<`0x${string}`>;
  writeContract(request: WriteContractParameters): Promise<`0x${string}`>;
  waitForReceipt(
    hash: `0x${string}`,
    chainId: number,
    timeoutMs: number,
  ): Promise<WaitForTransactionReceiptReturnType>;
  setThemeMode(mode: "light" | "dark"): void;
}

/**
 * The wallet's networks: Base Sepolia, where papers are signed (the Submission's EIP-712
 * domain names chain 84532) and ratings requested (ADR 0034); locally also Anvil, on
 * `localRpcUrl`, where ratings are requested (ADR 0036).
 */
export function walletNetworks(
  localRpcUrl: string | undefined,
): [AppKitNetwork, ...AppKitNetwork[]] {
  if (!localRpcUrl) return [baseSepolia];
  const anvil = { ...foundry, name: "Anvil", rpcUrls: { default: { http: [localRpcUrl] } } };
  return [baseSepolia, anvil];
}

/**
 * Sets up the wagmi adapter and AppKit's window, on {@link walletNetworks} with Base Sepolia
 * first, since wallets refuse typed data for another chain than the active one. The page
 * reaches this module only through `import()` (`providers.tsx`), so AppKit, WalletConnect and
 * Coinbase's SDK download only when a visitor uses the wallet or comes back connected. AppKit's
 * vanilla set-up needs no React provider: its window and wagmi's actions share the adapter's
 * config. Resolves once AppKit is ready, its stored session restored (or its set-up failed
 * part-way, which leaves the window usable).
 */
export async function createWalletRuntime(settings: WalletSettings): Promise<WalletRuntime> {
  const { projectId, localRpcUrl, theme } = settings;
  const networks = walletNetworks(localRpcUrl);
  const adapter = new WagmiAdapter({ projectId, networks });
  const config = adapter.wagmiConfig;
  const appKit = createAppKit({
    adapters: [adapter],
    projectId,
    networks,
    defaultNetwork: baseSepolia,
    metadata: {
      name: SITE.name,
      description: SITE.description,
      url: window.location.origin,
      icons: [],
    },
    features: { analytics: false },
    themeMode: theme,
    themeVariables: {
      // AppKit writes white text on its accent: the darker blue keeps the contrast.
      "--apkt-accent": "var(--accent-deep)",
      "--apkt-border-radius-master": "3px",
      "--apkt-font-family": "var(--font-sora), ui-sans-serif, system-ui, sans-serif",
    },
  });
  await appKit.ready().catch(() => undefined);

  return {
    account() {
      const { address, chainId, isConnected } = getAccount(config);
      return isConnected && address ? { address, chainId } : undefined;
    },
    subscribe: (listener) => watchAccount(config, { onChange: () => listener() }),
    open: async () => {
      await appKit.open();
    },
    switchChain: async (chainId) => {
      await switchChain(config, { chainId });
    },
    signTypedData: (request) => signTypedData(config, request),
    writeContract: (request) => writeContract(config, request),
    waitForReceipt: (hash, chainId, timeoutMs) =>
      waitForTransactionReceipt(config, { hash, chainId, timeout: timeoutMs }),
    setThemeMode: (mode) => appKit.setThemeMode(mode),
  };
}
