/** Builds the wallet's runtime once per page load, and again only after a failed build. */
export interface WalletLoader<S, T> {
  /** The runtime, built on the first call; calls made while it builds share that build. */
  load(settings: S): Promise<T>;
  /** The runtime once built, or undefined. */
  current(): T | undefined;
}

/**
 * A loader around `build` (in the page, an `import()` of the wallet's runtime, so its
 * libraries download only when a visitor needs them). A build that rejects is not kept: the
 * next `load` builds again, after a chunk failed to download, say.
 */
export function createWalletLoader<S, T>(build: (settings: S) => Promise<T>): WalletLoader<S, T> {
  let pending: Promise<T> | undefined;
  let built: T | undefined;
  return {
    load(settings) {
      pending ??= build(settings).then(
        (value) => {
          built = value;
          return value;
        },
        (error: unknown) => {
          pending = undefined;
          throw error;
        },
      );
      return pending;
    },
    current: () => built,
  };
}
