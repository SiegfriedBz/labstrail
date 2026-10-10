import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PaperSkeleton } from "./paper-skeleton.tsx";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";

describe("PaperSkeleton", () => {
  afterEach(cleanup);

  it("leads back to the papers list by the short CID, and marks the rest as loading", () => {
    render(<PaperSkeleton cid={CID} />);

    expect(screen.getByRole("link", { name: "Papers" }).getAttribute("href")).toBe("/papers");
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }).querySelector('[aria-current="page"]')
        ?.textContent,
    ).toBe("bafybeias652m2…rbkjokxu");
    expect(screen.getByRole("status", { name: "Loading paper" }).getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("names the paper by its canonical CID, whatever spelling the address has", () => {
    render(<PaperSkeleton cid="QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB" />);

    expect(screen.queryByText(/QmPZ9/)).toBeNull();
  });
});
