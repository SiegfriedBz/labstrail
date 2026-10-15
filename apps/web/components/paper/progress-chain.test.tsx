import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProgressChain } from "./progress-chain.tsx";

describe("ProgressChain", () => {
  afterEach(cleanup);

  it("explains each step while a paper is being published", () => {
    render(<ProgressChain stage="minting" />);

    expect(
      screen.getByText(/minted on Base by OriginTrail's Knowledge Asset contracts/),
    ).toBeTruthy();
    expect(screen.getByText("(in progress)")).toBeTruthy();
  });

  it("shows every step done, without their details, as a compact row", () => {
    render(<ProgressChain stage="published" compact />);

    expect(screen.getAllByRole("listitem").map((step) => step.textContent)).toEqual([
      "Read",
      "Saved off-chain",
      "Minted on-chain",
      "Published",
    ]);
    expect(screen.queryByText(/minted on Base by OriginTrail's/)).toBeNull();
  });
});
