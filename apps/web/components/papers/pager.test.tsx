import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pager } from "./pager.tsx";

describe("Pager", () => {
  afterEach(cleanup);

  it("links each page, marks the current one, and says where the visitor is", () => {
    render(<Pager page={2} lastPage={3} />);

    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(nav.textContent).toContain("Page 2 of 3");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Previous", "/papers"],
      ["1", "/papers"],
      ["2", "/papers?page=2"],
      ["3", "/papers?page=3"],
      ["Next", "/papers?page=3"],
    ]);
    expect(screen.getByRole("link", { name: "2" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "1" }).getAttribute("aria-current")).toBeNull();
  });

  it("has no Previous on the first page and no Next on the last", () => {
    render(<Pager page={1} lastPage={2} />);
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next" })).toBeTruthy();
    cleanup();

    render(<Pager page={2} lastPage={2} />);
    expect(screen.getByRole("link", { name: "Previous" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });

  it("shows gaps between distant pages", () => {
    render(<Pager page={6} lastPage={12} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Previous",
      "1",
      "5",
      "6",
      "7",
      "12",
      "Next",
    ]);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pager page={1} lastPage={1} />);

    expect(container.innerHTML).toBe("");
  });
});
