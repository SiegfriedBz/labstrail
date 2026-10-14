import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../wallet/providers.tsx", () => ({ useWalletReady: () => false }));
vi.mock("../../app/actions.ts", () => ({ announceLocalRating: vi.fn() }));

const { RateButton } = await import("./rate-button.tsx");

describe("RateButton", () => {
  afterEach(cleanup);

  it("says ratings can't be requested when the wallet window isn't set up", () => {
    render(
      <RateButton
        ual="did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7"
        cid="bafy"
        config={{
          chainId: 84_532,
          contract: "0xa5be5ee8e4b6825c4425cc208f0df09fb8147a90",
          local: false,
        }}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/ratings can't be requested here/)).toBeTruthy();
  });
});
