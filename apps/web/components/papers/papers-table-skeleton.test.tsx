import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PapersTableSkeleton } from "./papers-table-skeleton.tsx";

describe("PapersTableSkeleton", () => {
  afterEach(cleanup);

  it("shows as many placeholder rows as asked, marked as loading", () => {
    render(<PapersTableSkeleton rows={4} />);

    const skeleton = screen.getByLabelText("Loading papers");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(skeleton.querySelectorAll("[data-skeleton-row]")).toHaveLength(4);
  });
});
