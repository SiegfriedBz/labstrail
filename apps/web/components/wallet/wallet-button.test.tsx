import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const open = vi.fn(async () => {});
const runtime = { open };
const load = vi.fn(async () => runtime);
const preload = vi.fn();
const ready = vi.fn(() => true);
let wallet: Record<string, unknown> = { status: "idle" };
vi.mock("./providers.tsx", () => ({
  useWalletReady: () => ready(),
  useWallet: () => ({ load, preload, ...wallet }),
}));

const { WalletButton } = await import("./wallet-button.tsx");

describe("WalletButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    wallet = { status: "idle" };
  });

  it("before the wallet loads, offers Connect, marked for the page's pre-paint look", () => {
    render(<WalletButton />);

    const button = screen.getByRole("button", { name: "Connect wallet" });
    expect(button.hasAttribute("data-wallet-connect")).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it("starts loading the wallet when the pointer, focus or a touch reaches it, opening nothing", () => {
    render(<WalletButton />);
    const button = screen.getByRole("button", { name: "Connect wallet" });

    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    fireEvent.touchStart(button);

    expect(preload).toHaveBeenCalledTimes(3);
    expect(open).not.toHaveBeenCalled();
  });

  it("loads the wallet on a click, then opens AppKit's window", async () => {
    render(<WalletButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    });

    expect(load).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
  });

  it("is busy and disabled while a click waits for the wallet", () => {
    wallet = { status: "loading" };
    render(<WalletButton />);

    const button = screen.getByRole("button", { name: "Connect wallet" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("is a same-size placeholder while a stored session is restored, with no Connect", () => {
    wallet = { status: "restoring" };
    render(<WalletButton />);

    const placeholder = screen.getByRole("button", { name: "Wallet loading" });
    expect((placeholder as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Connect wallet")).toBeNull();
  });

  it("shows a connected address in short form, named as shown, and opens the account window", async () => {
    wallet = {
      status: "connected",
      account: { address: ADDRESS, chainId: 84532 },
      runtime,
    };
    render(<WalletButton />);

    const button = screen.getByRole("button", { name: "Wallet 0x9a17…9111, open account" });
    expect(button.textContent).toBe("0x9a17…9111");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(open).toHaveBeenCalledOnce();
  });

  it("offers to retry when the wallet couldn't load, and tries again on a click", async () => {
    wallet = { status: "failed" };
    render(<WalletButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry wallet" }));
    });

    expect(load).toHaveBeenCalledOnce();
  });

  it("says so when the wallet is not set up", () => {
    ready.mockReturnValueOnce(false);
    render(<WalletButton />);

    expect(screen.getByText("Wallet not set up")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
