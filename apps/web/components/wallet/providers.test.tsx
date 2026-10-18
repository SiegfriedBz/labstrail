import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPKIT_CONNECTION_STATUS_KEY } from "../../lib/wallet/session.ts";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const setThemeMode = vi.fn();
const runtime = {
  account: () => ({ address: ADDRESS, chainId: 84532 }),
  subscribe: () => () => {},
  setThemeMode,
};
const createWalletRuntime = vi.fn(async (_settings: unknown) => runtime);
vi.mock("./wallet-runtime.ts", () => ({ createWalletRuntime }));

/** The providers module afresh, so each test starts with no wallet loaded. */
async function providers() {
  vi.resetModules();
  return import("./providers.tsx");
}

async function show(projectId: string | undefined, localRpcUrl?: string) {
  const { WalletProvider, useWallet, useWalletReady } = await providers();
  function Probe() {
    const wallet = useWallet();
    return (
      <p>
        {useWalletReady() ? "ready" : "not ready"} {wallet.status} {wallet.account?.address}
      </p>
    );
  }
  const view = render(
    <WalletProvider projectId={projectId} localRpcUrl={localRpcUrl}>
      <Probe />
    </WalletProvider>,
  );
  return { view, Probe, WalletProvider };
}

const idleLater = () => act(async () => vi.advanceTimersByTimeAsync(2_000));

describe("WalletProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.dataset.theme = "light";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
    delete document.documentElement.dataset.wallet;
    Reflect.deleteProperty(window, "requestIdleCallback");
  });

  it("loads nothing without a project id, whatever is stored, and says the wallet isn't set up", async () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    document.documentElement.dataset.wallet = "restoring";
    await show(undefined);
    await idleLater();

    expect(screen.getByText(/not ready idle/)).toBeTruthy();
    expect(createWalletRuntime).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.wallet).toBeUndefined();
  });

  it("loads no wallet module for a visitor with no stored session", async () => {
    await show("test-project");
    await idleLater();

    expect(screen.getByText(/ready idle/)).toBeTruthy();
    expect(createWalletRuntime).not.toHaveBeenCalled();
  });

  it("restores a stored session once the page is idle, showing restoring until then", async () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    document.documentElement.dataset.wallet = "restoring";
    await show("test-project", "http://127.0.0.1:8546");

    expect(screen.getByText(/ready restoring/)).toBeTruthy();
    expect(createWalletRuntime).not.toHaveBeenCalled();
    await idleLater();

    expect(createWalletRuntime).toHaveBeenCalledWith({
      projectId: "test-project",
      localRpcUrl: "http://127.0.0.1:8546",
      theme: "light",
    });
    expect(screen.getByText(new RegExp(`ready connected ${ADDRESS}`))).toBeTruthy();
    expect(document.documentElement.dataset.wallet).toBeUndefined();
  });

  it("waits for the browser's idle callback where it has one", async () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    const requestIdleCallback = vi.fn((task: () => void) => {
      task();
      return 1;
    });
    Object.assign(window, { requestIdleCallback });
    await show("test-project");
    await act(async () => {});

    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(createWalletRuntime).toHaveBeenCalledOnce();
  });

  it("keeps the loaded wallet across re-renders, as a client-side navigation does", async () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    const { view, Probe, WalletProvider } = await show("test-project");
    await idleLater();

    view.rerender(
      <WalletProvider projectId="test-project">
        <Probe />
        <Probe />
      </WalletProvider>,
    );
    await idleLater();

    expect(screen.getAllByText(/ready connected/)).toHaveLength(2);
    expect(createWalletRuntime).toHaveBeenCalledOnce();
  });

  it("keeps AppKit's window in the page's theme once loaded", async () => {
    localStorage.setItem(APPKIT_CONNECTION_STATUS_KEY, "connected");
    await show("test-project");
    await idleLater();

    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      await Promise.resolve();
    });

    expect(setThemeMode).toHaveBeenLastCalledWith("dark");
  });
});
