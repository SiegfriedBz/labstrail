import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const CONFIG = {
  chainId: 84_532,
  contract: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90",
  local: false,
};
const runtime = {
  open: vi.fn(async () => {}),
  account: vi.fn(() => ({ address: ADDRESS, chainId: 84532 })),
  switchChain: vi.fn(async (_chainId: number) => {}),
  writeContract: vi.fn(async (_request: unknown) => "0xabc1" as `0x${string}`),
  waitForReceipt: vi.fn(async () => ({ status: "success", logs: [] })),
};
const load = vi.fn(async () => runtime);
const preload = vi.fn();
const ready = vi.fn(() => true);
let wallet: Record<string, unknown> = { status: "idle" };
vi.mock("../wallet/providers.tsx", () => ({
  useWalletReady: () => ready(),
  useWallet: () => ({ load, preload, ...wallet }),
}));
vi.mock("../../app/actions.ts", () => ({ announceLocalRating: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
type Deps = {
  account(): unknown;
  connect(): void;
  switchChain(id: number): Promise<void>;
  sendRequest(target: string): Promise<string>;
  waitForReceipt(hash: string): Promise<unknown>;
};
const requestRating = vi.fn(async (_ual: string, _deps: Deps) => ({
  ok: false as const,
  problem: "declined" as const,
}));
vi.mock("../../lib/rating/request-flow.ts", () => ({ requestRating }));

const { RateButton } = await import("./rate-button.tsx");

const show = () => render(<RateButton ual={UAL} cid="bafy" config={CONFIG} />);

describe("RateButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    wallet = { status: "idle" };
  });

  it("says ratings can't be requested when the wallet window isn't set up", () => {
    ready.mockReturnValueOnce(false);
    show();

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/ratings can't be requested here/)).toBeTruthy();
  });

  it("preloads the wallet when the pointer, focus or a touch reaches it", () => {
    show();
    const button = screen.getByRole("button", { name: "Rate this paper" });

    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    fireEvent.touchStart(button);

    expect(preload).toHaveBeenCalledTimes(3);
    expect(requestRating).not.toHaveBeenCalled();
  });

  it("says it is opening the wallet while a click waits for it to load", async () => {
    let finish: (value: typeof runtime) => void = () => {};
    load.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rate this paper" }));
    });
    expect(screen.getByRole("button", { name: "Opening your wallet" })).toBeTruthy();
    await act(async () => finish(runtime));
  });

  it("loads the wallet on a click, then requests the rating through it", async () => {
    show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rate this paper" }));
    });
    const deps = requestRating.mock.calls[0]?.[1];
    if (!deps) throw new Error("requestRating was not called");
    deps.connect();
    await deps.switchChain(84532);
    expect(await deps.sendRequest(UAL)).toBe("0xabc1");
    await deps.waitForReceipt("0xabc1");

    expect(load).toHaveBeenCalledOnce();
    expect(requestRating.mock.calls[0]?.[0]).toBe(UAL);
    expect(deps.account()).toEqual({ address: ADDRESS, chainId: 84532 });
    expect(runtime.open).toHaveBeenCalledOnce();
    expect(runtime.switchChain).toHaveBeenCalledWith(84532);
    expect(runtime.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: CONFIG.contract,
        functionName: "requestPhase1",
        args: [UAL],
        chainId: 84532,
      }),
    );
    expect(runtime.waitForReceipt).toHaveBeenCalledWith("0xabc1", 84532, 90_000);
  });

  it("says the wallet couldn't load when its load fails, and requests nothing", async () => {
    load.mockRejectedValueOnce(new Error("Loading chunk failed"));
    show();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rate this paper" }));
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "The wallet couldn't load. Check your connection and try again.",
    );
    expect(requestRating).not.toHaveBeenCalled();
  });
});
