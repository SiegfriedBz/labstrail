import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/papers");
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

const { HeaderNav } = await import("./header-nav.tsx");

describe("HeaderNav", () => {
  afterEach(cleanup);

  it("links Papers before Publish, and marks Papers current on /papers", () => {
    render(<HeaderNav />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Papers", "/papers"],
      ["Publish", "/publish"],
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(links[1]?.getAttribute("aria-current")).toBeNull();
  });
});
