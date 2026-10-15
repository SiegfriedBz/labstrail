import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChainDemo } from "./chain-demo.tsx";

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce, media: query }));
}

const steps = () =>
  screen.getAllByRole("listitem").map((step) => step.querySelector("p")?.firstChild?.textContent);

describe("ChainDemo", () => {
  beforeEach(() => reducedMotion(false));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("plays the publish flow, then rates the same paper, ending on its score", async () => {
    vi.useFakeTimers();
    render(<ChainDemo />);

    expect(screen.getByRole("tab", { name: "Publish" }).getAttribute("aria-selected")).toBe("true");
    expect(steps()).toEqual(["Read", "Saved", "Minted", "Published"]);

    let scored = false;
    for (let waited = 0; waited < 30_000 && !scored; waited += 1000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      scored = screen.queryByTestId("demo-score")?.textContent === "67";
    }
    expect(scored).toBe(true);
    expect(screen.getByRole("tab", { name: "Rate" }).getAttribute("aria-selected")).toBe("true");
    expect(steps()).toEqual(["Scored", "Saved", "Minted", "Recorded"]);
  });

  it("shows the flow its tab picks, and stays on it", async () => {
    vi.useFakeTimers();
    render(<ChainDemo />);

    fireEvent.click(screen.getByRole("tab", { name: "Rate" }));
    expect(steps()).toEqual(["Scored", "Saved", "Minted", "Recorded"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole("tab", { name: "Rate" }).getAttribute("aria-selected")).toBe("true");
  });

  it("holds still for visitors who ask for reduced motion", async () => {
    reducedMotion(true);
    vi.useFakeTimers();
    render(<ChainDemo />);
    const before = screen.getByRole("tabpanel").textContent;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole("tabpanel").textContent).toBe(before);
  });
});
