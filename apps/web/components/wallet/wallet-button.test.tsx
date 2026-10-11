import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const open = vi.fn();
const account = vi.fn(() => ({ address: undefined as string | undefined, isConnected: false }));
const ready = vi.fn(() => true);
vi.mock("wagmi", () => ({ useAccount: () => account() }));
vi.mock("@reown/appkit/react", () => ({ useAppKit: () => ({ open }) }));
vi.mock("./providers.tsx", () => ({ useWalletReady: () => ready() }));

const { WalletButton } = await import("./wallet-button.tsx");

describe("WalletButton", () => {
  afterEach(() => {
    cleanup();
    open.mockClear();
  });

  it("opens AppKit's window to connect", () => {
    render(<WalletButton />);

    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("shows a connected address in short form, named as shown, and opens the account window", () => {
    account.mockReturnValueOnce({ address: ADDRESS, isConnected: true });
    render(<WalletButton />);

    const button = screen.getByRole("button", { name: "Wallet 0x9a17…9111, open account" });
    expect(button.textContent).toBe("0x9a17…9111");
    fireEvent.click(button);
    expect(open).toHaveBeenCalledOnce();
  });

  it("says so when the wallet is not set up", () => {
    ready.mockReturnValueOnce(false);
    render(<WalletButton />);

    expect(screen.getByText("Wallet not set up")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
