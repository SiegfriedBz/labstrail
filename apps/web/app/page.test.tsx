import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/home/latest-papers.tsx", () => ({ LatestPapers: () => <p>latest</p> }));
vi.mock("../components/home/chain-demo.tsx", () => ({ ChainDemo: () => null }));

const { default: Home } = await import("./page.tsx");
const { SITE } = await import("../lib/site.ts");

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

  it("opens with the sentence that says what VeriSci is", () => {
    const { container } = render(<Home />);

    expect(container.querySelector("section p")?.textContent).toBe(SITE.definition);
  });

  it("names its flows in their headings alone, their status beside them", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 3, name: "Publish" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Rate" })).toBeTruthy();
  });

  it("describes the website and the organization behind it for search engines", () => {
    const { container } = render(<Home />);

    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0]?.textContent ?? "");
    expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual([
      "WebSite",
      "Organization",
    ]);
  });
});
