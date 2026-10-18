/**
 * Where the wallet is: `idle` before it loads, `loading` while a wallet action waits for it,
 * `restoring` while a stored session comes back, then `connected` or `disconnected`; `failed`
 * when a wallet action couldn't load it.
 */
export type WalletStatus =
  | "idle"
  | "loading"
  | "restoring"
  | "connected"
  | "disconnected"
  | "failed";

/** The connected account: its address and the chain the wallet is on. */
export interface WalletAccount {
  readonly address: `0x${string}`;
  readonly chainId: number | undefined;
}

/** What the store reads from a loaded runtime: its account, and when it changes. */
export interface AccountSource {
  account(): WalletAccount | undefined;
  subscribe(listener: () => void): () => void;
}

/** The wallet as components see it: its status, its account once connected, its runtime once loaded. */
export interface WalletState<R> {
  readonly status: WalletStatus;
  readonly account?: WalletAccount;
  readonly runtime?: R;
}

/** The wallet's state for `useSyncExternalStore`, and the three ways to load it. */
export interface WalletStore<R> {
  getState(): WalletState<R>;
  subscribe(listener: () => void): () => void;
  /** A wallet action (Connect, publish, Rate): loads the wallet, or gives the loaded one. */
  load(): Promise<R>;
  /**
   * The pointer or focus reached a wallet button: loads quietly, idle again if it fails (or
   * still `failed`, when a wallet action failed first).
   */
  preload(): void;
  /**
   * A stored session: `restoring` at once, loaded when `defer` runs its task, idle if it fails
   * (or still `failed`, when a wallet action failed meanwhile).
   */
  restore(defer: (task: () => void) => void): void;
}

/**
 * The wallet's state, around `load` (the page's loader, which builds the runtime once). Once
 * loaded, the state follows the runtime's account: connecting, switching account or chain and
 * disconnecting reach every component without a reload.
 */
export function createWalletStore<R extends AccountSource>(load: () => Promise<R>): WalletStore<R> {
  let state: WalletState<R> = { status: "idle" };
  const listeners = new Set<() => void>();
  let following: R | undefined;

  const set = (next: WalletState<R>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const settled = (runtime: R): WalletState<R> => {
    const account = runtime.account();
    return account
      ? { status: "connected", account, runtime }
      : { status: "disconnected", runtime };
  };
  const loaded = (runtime: R): R => {
    if (following !== runtime) {
      following = runtime;
      runtime.subscribe(() => set(settled(runtime)));
    }
    set(settled(runtime));
    return runtime;
  };
  /** A quiet load failed: idle again, keeping a failed wallet action's state for its retry. */
  const backToIdle = () => {
    if (!state.runtime && state.status !== "failed") set({ status: "idle" });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      if (state.status !== "restoring" && !state.runtime) set({ status: "loading" });
      return load().then(loaded, (error: unknown) => {
        if (!state.runtime) set({ status: "failed" });
        throw error;
      });
    },
    preload() {
      load().then(loaded, backToIdle);
    },
    restore(defer) {
      if (state.runtime) return;
      set({ status: "restoring" });
      defer(() => {
        load().then(loaded, backToIdle);
      });
    },
  };
}
