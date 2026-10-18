import { describe, expect, it, vi } from "vitest";
import { createWalletStore, type WalletAccount } from "./store.ts";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";

/** A runtime whose account the test sets, telling its listeners like `watchAccount` does. */
function fakeRuntime(initial?: WalletAccount) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    account: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: WalletAccount | undefined) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

/** A load the test finishes by hand. */
function pendingLoad<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<T>((ok, fail) => {
        resolve = ok;
        reject = fail;
      }),
  );
  return { load, resolve: (value: T) => resolve(value), reject: (e: unknown) => reject(e) };
}

describe("createWalletStore", () => {
  it("starts idle, with no account and no runtime", () => {
    const store = createWalletStore(vi.fn());

    expect(store.getState()).toEqual({ status: "idle" });
    expect(store.getState()).toBe(store.getState());
  });

  it("is loading during a wallet action, then connected with the restored account", async () => {
    const runtime = fakeRuntime({ address: ADDRESS, chainId: 84532 });
    const { load, resolve } = pendingLoad<typeof runtime>();
    const store = createWalletStore(load);

    const loaded = store.load();
    expect(store.getState().status).toBe("loading");
    resolve(runtime);

    expect(await loaded).toBe(runtime);
    expect(store.getState()).toEqual({
      status: "connected",
      account: { address: ADDRESS, chainId: 84532 },
      runtime,
    });
  });

  it("is disconnected once loaded when the wallet holds no account", async () => {
    const runtime = fakeRuntime();
    const store = createWalletStore(async () => runtime);

    await store.load();

    expect(store.getState()).toEqual({ status: "disconnected", runtime });
  });

  it("fails a wallet action whose load rejects, and loads again on the next one", async () => {
    const runtime = fakeRuntime();
    const chunkError = new Error("Loading chunk failed");
    const load = vi
      .fn<() => Promise<typeof runtime>>()
      .mockRejectedValueOnce(chunkError)
      .mockResolvedValueOnce(runtime);
    const store = createWalletStore(load);

    await expect(store.load()).rejects.toBe(chunkError);
    expect(store.getState()).toEqual({ status: "failed" });
    await store.load();
    expect(store.getState().status).toBe("disconnected");
  });

  it("restores a stored session once the page is idle, restoring until then", async () => {
    const runtime = fakeRuntime({ address: ADDRESS, chainId: 84532 });
    const load = vi.fn(async () => runtime);
    const store = createWalletStore(load);
    let idle: () => void = () => {};

    store.restore((task) => {
      idle = task;
    });
    expect(store.getState().status).toBe("restoring");
    expect(load).not.toHaveBeenCalled();
    idle();

    await vi.waitFor(() => expect(store.getState().status).toBe("connected"));
  });

  it("goes back to idle, not failed, when restoring can't load the wallet", async () => {
    const store = createWalletStore(() => Promise.reject(new Error("offline")));

    store.restore((task) => task());

    await vi.waitFor(() => expect(store.getState()).toEqual({ status: "idle" }));
  });

  it("stays restoring when a wallet action comes while a session is being restored", async () => {
    const runtime = fakeRuntime();
    const { load, resolve } = pendingLoad<typeof runtime>();
    const store = createWalletStore(load);

    store.restore((task) => task());
    const loaded = store.load();
    expect(store.getState().status).toBe("restoring");
    resolve(runtime);

    await loaded;
    expect(store.getState().status).toBe("disconnected");
  });

  it("preloads quietly: idle while it loads, idle again if it fails", async () => {
    const runtime = fakeRuntime();
    const { load, resolve } = pendingLoad<typeof runtime>();
    const store = createWalletStore(load);

    store.preload();
    expect(store.getState().status).toBe("idle");
    resolve(runtime);
    await vi.waitFor(() => expect(store.getState().status).toBe("disconnected"));

    const failing = createWalletStore(() => Promise.reject(new Error("offline")));
    failing.preload();
    await Promise.resolve();
    expect(failing.getState()).toEqual({ status: "idle" });
  });

  it("follows the wallet's account once loaded, and tells its listeners", async () => {
    const runtime = fakeRuntime();
    const store = createWalletStore(async () => runtime);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();
    listener.mockClear();

    runtime.set({ address: ADDRESS, chainId: 1 });
    expect(store.getState()).toMatchObject({
      status: "connected",
      account: { address: ADDRESS, chainId: 1 },
    });
    runtime.set(undefined);
    expect(store.getState()).toEqual({ status: "disconnected", runtime });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
