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

  it.each([
    ["/publish", "Publish"],
    ["/papers/bafy1", "Papers"],
    [`/papers/bafy1/ratings/0x${"ab".repeat(32)}`, "Papers"],
  ])("marks the section of %s current: %s", (path, current) => {
    pathname.mockReturnValue(path);
    render(<HeaderNav />);

    const marked = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual([current]);
  });

  it.each(["/", "/papersmith"])("marks neither link current on %s", (path) => {
    pathname.mockReturnValue(path);
    render(<HeaderNav />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });
});
