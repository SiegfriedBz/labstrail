import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/home/latest-papers.tsx", () => ({ LatestPapers: () => <p>latest</p> }));
vi.mock("../components/home/chain-demo.tsx", () => ({ ChainDemo: () => null }));

const { default: Home } = await import("./page.tsx");

describe("/", () => {
  afterEach(cleanup);

  it("says rating is live and links to the papers to rate", () => {
    render(<Home />);

    expect(screen.queryByText("coming soon")).toBeNull();
    expect(screen.getByText("phase 1 live")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pick a paper to rate" }).getAttribute("href")).toBe(
      "/papers",
    );
  });
});
