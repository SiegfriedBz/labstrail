import { cleanup, render, screen, within } from "@testing-library/react";
import type { PaperSummary } from "@verisci/workflows";
import { afterEach, describe, expect, it } from "vitest";
import { PapersTable } from "./papers-table.tsx";

const FIRST: PaperSummary = {
  cid: "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m",
  ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
  publishedAt: "2026-10-10T15:14:13.222Z",
  title: "TEAD4 Regulates apical domain homeostasis",
  authors: ["Alexander W Bruce", "Rebecca Collier", "Martina Bohuslavová"],
  authorCount: 10,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signatureCheck: "valid",
};
const SECOND: PaperSummary = {
  ...FIRST,
  cid: "bafybeihhkeyxcad3cuj42gvhpsh67tiagkwfxbjgjsx7m3tidbkknkifcy",
  title: "Cross-kingdom RNA interference",
  authors: [],
  authorCount: 0,
  signatureCheck: "unknown",
};

describe("PapersTable", () => {
  afterEach(cleanup);

  it("shows one row per paper, its title linked to its page", () => {
    render(<PapersTable papers={[FIRST, SECOND]} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0] as HTMLElement)
        .getByRole("link", { name: FIRST.title })
        .getAttribute("href"),
    ).toBe(`/papers/${FIRST.cid}`);
  });

  it("names the columns", () => {
    render(<PapersTable papers={[FIRST]} />);

    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Paper",
      "Published",
      "Submitted by",
      "Signature",
    ]);
  });

  it("shows the first authors, the date, the short submitter and the signature check", () => {
    render(<PapersTable papers={[FIRST, SECOND]} />);
    const [first, second] = screen.getAllByRole("row").slice(1) as HTMLElement[];

    expect(
      within(first as HTMLElement).getByText(
        "Alexander W Bruce, Rebecca Collier, Martina Bohuslavová +7 more",
      ),
    ).toBeTruthy();
    expect(within(first as HTMLElement).getAllByText("10 Oct 2026").length).toBeGreaterThan(0);
    expect(within(first as HTMLElement).getAllByText("0x9a17…9111").length).toBeGreaterThan(0);
    expect(within(first as HTMLElement).getAllByText("Valid").length).toBeGreaterThan(0);
    expect(within(second as HTMLElement).getByText("No authors listed")).toBeTruthy();
    expect(within(second as HTMLElement).getAllByText("Not checked").length).toBeGreaterThan(0);
  });

  it("gives the publish date as a machine-readable time", () => {
    render(<PapersTable papers={[FIRST]} />);

    expect(
      screen.getAllByText("10 Oct 2026").map((time) => time.closest("time")?.dateTime),
    ).toContain(FIRST.publishedAt);
  });

  it("words a signature that does not match", () => {
    render(<PapersTable papers={[{ ...FIRST, signatureCheck: "invalid" }]} />);

    expect(screen.getAllByText("Doesn't match").length).toBeGreaterThan(0);
  });
});
