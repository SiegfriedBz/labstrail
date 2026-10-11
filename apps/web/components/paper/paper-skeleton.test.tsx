import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VERIFY_LABELS } from "./labels.ts";
import { PaperSkeleton } from "./paper-skeleton.tsx";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const SHORT_CID = "bafybeias652m2…rbkjokxu";

describe("PaperSkeleton", () => {
  afterEach(cleanup);

  it("leads back to the papers list by the short CID, and marks the rest as loading", () => {
    render(<PaperSkeleton cid={CID} following={false} />);

    expect(screen.getByRole("link", { name: "Papers" }).getAttribute("href")).toBe("/papers");
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }).querySelector('[aria-current="page"]')
        ?.textContent,
    ).toBe(SHORT_CID);
    expect(screen.getByRole("status", { name: "Loading paper" }).getAttribute("aria-busy")).toBe(
      "true",
    );
  });

  it("shows the verify panel's heading and labels, with only the values to come", () => {
    render(<PaperSkeleton cid={CID} following={false} />);

    expect(screen.getByRole("heading", { name: "Verify it yourself" })).toBeTruthy();
    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual([
      VERIFY_LABELS.submitter,
      VERIFY_LABELS.signature,
      VERIFY_LABELS.deadline,
      VERIFY_LABELS.contextGraph,
      VERIFY_LABELS.publisher,
      VERIFY_LABELS.token,
      VERIFY_LABELS.ual,
      VERIFY_LABELS.pdf,
    ]);
    expect(screen.getAllByText(SHORT_CID).length).toBeGreaterThan(1);
  });

  it("shows the publish panel's labels while a publish is followed", () => {
    render(<PaperSkeleton cid={CID} following />);

    expect(screen.queryByRole("heading", { name: "Verify it yourself" })).toBeNull();
    expect(screen.getByRole("heading", { name: "What's happening now" })).toBeTruthy();
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "PDF (CID)",
      "IPFS link",
    ]);
  });

  it("names the paper by its canonical CID, whatever spelling the address has", () => {
    render(
      <PaperSkeleton cid="QmPZ9gcCEpqKTo6aq61g2nXGUhM4iCL3ewB6LDXZCtioEB" following={false} />,
    );

    expect(screen.queryByText(/QmPZ9/)).toBeNull();
  });
});
