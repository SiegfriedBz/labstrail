"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createWalletLoader } from "../../lib/wallet/loader.ts";
import { hasStoredWalletSession } from "../../lib/wallet/session.ts";
import { createWalletStore, type WalletState, type WalletStore } from "../../lib/wallet/store.ts";
import { useTheme } from "../site/theme-toggle.tsx";
import type { WalletRuntime, WalletSettings } from "./wallet-runtime.ts";

/**
 * Builds the wallet's runtime once per page load. `import()` keeps AppKit, wagmi, WalletConnect
 * and Coinbase's SDK out of every page's JavaScript until a visitor needs them.
 */
const loader = createWalletLoader((settings: WalletSettings) =>
  import("./wallet-runtime.ts").then(({ createWalletRuntime }) => createWalletRuntime(settings)),
);

/** How long to wait for an idle moment where the browser has no `requestIdleCallback`. */
const IDLE_FALLBACK_MS = 2_000;

const Ready = createContext(false);
const Store = createContext<WalletStore<WalletRuntime> | undefined>(undefined);

/** Whether the wallet window can be set up: false without a Reown project id. */
export function useWalletReady(): boolean {
  return useContext(Ready);
}

/** The wallet as components use it: its state, and the ways to load it. */
export interface Wallet extends WalletState<WalletRuntime> {
  /** A wallet action: loads the wallet (or gives the loaded one), for its window or a request. */
  load(): Promise<WalletRuntime>;
  /** The pointer, focus or a touch reached a wallet button: starts loading, opens nothing. */
  preload(): void;
}

const IDLE: WalletState<WalletRuntime> = { status: "idle" };
const noStore = (): (() => void) => () => {};

/** The wallet's state and actions; `idle` and inert without a project id. */
export function useWallet(): Wallet {
  const store = useContext(Store);
  const state = useSyncExternalStore(
    store?.subscribe ?? noStore,
    store?.getState ?? (() => IDLE),
    () => IDLE,
  );
  return {
    ...state,
    load: () => store?.load() ?? Promise.reject(new Error("The wallet is not set up")),
    preload: () => store?.preload(),
  };
}

/** Runs `task` once the browser is idle, or after {@link IDLE_FALLBACK_MS} where it can't say. */
function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(task);
  else window.setTimeout(task, IDLE_FALLBACK_MS);
}

/**
 * The wallet's state for the whole page, loading nothing on its own: the wallet loads on a
 * wallet action, or once the page is idle when this browser remembers a connected wallet,
 * so a returning visitor sees their address. The project id comes from the server
 * (`REOWN_PROJECT_ID`), so no value is inlined at build time; without one, the pages say the
 * wallet is not set up. Keeps AppKit's window in the page's theme once loaded.
 */
export function WalletProvider({
  projectId,
  localRpcUrl,
  children,
}: {
  projectId: string | undefined;
  /** Anvil's URL, set only with `APP_ENV=local`, for requesting ratings there. */
  localRpcUrl?: string | undefined;
  children: ReactNode;
}) {
  const [store] = useState(() =>
    projectId
      ? createWalletStore(() => loader.load({ projectId, localRpcUrl, theme: pageTheme() }))
      : undefined,
  );
  const state = useSyncExternalStore(
    store?.subscribe ?? noStore,
    store?.getState ?? (() => IDLE),
    () => IDLE,
  );
  const theme = useTheme();

  useEffect(() => {
    if (store && hasStoredWalletSession(window.localStorage)) store.restore(whenIdle);
  }, [store]);

  useEffect(() => {
    if (state.status !== "restoring") delete document.documentElement.dataset.wallet;
  }, [state.status]);

  useEffect(() => {
    state.runtime?.setThemeMode(theme);
  }, [state.runtime, theme]);

  return (
    <Ready value={Boolean(projectId)}>
      <Store value={store}>{children}</Store>
    </Ready>
  );
}

/** The page's theme, which `THEME_SCRIPT` set before the first paint. */
function pageTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
