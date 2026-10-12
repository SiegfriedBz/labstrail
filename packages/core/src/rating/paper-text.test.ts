import { describe, expect, it } from "vitest";
import { AEROSOL_PAGES } from "../fixtures/aerosol-pages.ts";
import { CITICOLINE_PAGES } from "../fixtures/citicoline-pages.ts";
import { normalizeForQuote, preparePaperText, quoteFound, quoteTextOf } from "./paper-text.ts";

const WORDS = (count: number, word = "word") => Array.from({ length: count }, () => word).join(" ");
const prepared = (pages: readonly string[], maxChars = 150_000) => {
  const result = preparePaperText(pages, maxChars);
  if (!result.ok) throw new Error(`expected text, got ${result.reason}`);
  return result.paper;
};

describe("preparePaperText", () => {
  it("joins a real paper's pages, keeping its statements, and leaves it whole under the cap", () => {
    const paper = prepared(CITICOLINE_PAGES);

    expect(paper.shortened).toBe(false);
    expect(paper.text).toContain("Citicoline in acute ischemic stroke");
    expect(paper.text).toContain("Competing interests: NO authors have competing\ninterests.");
    expect(paper.text).toContain("Data Availability Statement: All relevant are within");
    expect(paper.text.indexOf("Competing interests")).toBeGreaterThan(
      paper.text.indexOf("Data Availability Statement"),
    );
  });

  it("joins a word hyphenated across a line break", () => {
    const paper = prepared(CITICOLINE_PAGES);

    expect(paper.text).toContain("Medical Sciences Institutional ethics committee");
    expect(paper.text).not.toContain("Institu-\ntional");
  });

  it("keeps a hyphen between a word and a capital or a digit across a line break", () => {
    const paper = prepared([`${WORDS(200)}\nPG-\nThesis and COVID-\n19 cases`]);

    expect(paper.text).toContain("PG-\nThesis and COVID-\n19 cases");
  });

  it("drops lines that hold only a number, such as line and page numbers", () => {
    const paper = prepared([`${WORDS(200)}\n12\nrandomly assigned\n 13 \nto receive\n2 / 12`]);

    expect(paper.text).toContain("randomly assigned\nto receive\n2 / 12");
  });

  it("drops the number a line-numbered manuscript glues to each line, across pages", () => {
    const paper = prepared(AEROSOL_PAGES);

    expect(paper.text).toContain("Abstract\nHCoV-19 (SARS-2) has caused");
    expect(paper.text).toContain("coronavirus 2\n(SARS-CoV-2");
    expect(paper.text).toContain("model.\nMethods\nHCoV-19 nCoV-WA1-2020");
    expect(paper.text).toContain("deaths.1\nThe rapid expansion");
    expect(paper.text).toContain("containing HCoV-19 (105.25\nTCID50/mL)");
    expect(paper.text).not.toMatch(/surface\.83|Methods66|that40/);
    expect(
      quoteFound(
        quoteTextOf(paper.text),
        "Three replicate experiments were performed for each surface. Viable virus in all surface and aerosol samples was quantified by end-point titration on Vero E6 cells",
      ),
    ).toBe(true);
  });

  it("keeps a line's own digits before its number", () => {
    const lines = Array.from({ length: 9 }, (_, line) => `Line ${line} of the text.${line + 90}`);
    const paper = prepared([
      [...lines, "the NUTS 202199", "boundaries in 2020.100", WORDS(200)].join("\n"),
    ]);

    expect(paper.text).toContain("Line 8 of the text.\nthe NUTS 2021\nboundaries in 2020.\n");
  });

  it("keeps numbers at line ends that do not count up line by line, or not for long", () => {
    const weeks = Array.from({ length: 10 }, (_, week) => `Week ${week + 10}`);
    const notes = ["alpha1", "bravo2", "charlie3", "delta4", "echo5", "foxtrot6", "golf7"];
    const paper = prepared([[...weeks, ...notes, WORDS(200)].join("\n")]);

    expect(paper.text).toContain("Week 10\nWeek 11");
    expect(paper.text).toContain("alpha1\nbravo2");
  });

  it("collapses runs of spaces and of blank lines", () => {
    const paper = prepared([`${WORDS(200)}  \t two  spaces\n\n\n\nnext`]);

    expect(paper.text).toContain("word two spaces\n\nnext");
  });

  it("refuses a PDF whose pages hold almost no letters, such as a scanned one", () => {
    expect(preparePaperText(["1\n2\n3", "", "Page 2 of 9"], 150_000)).toEqual({
      ok: false,
      reason: "no-text",
    });
  });

  it("leaves the reference list out when the text passes the cap, keeping what follows it", () => {
    const body = `Introduction\n${WORDS(400, "study")}\nMethods\nWe randomized patients.`;
    const references = `References\n${Array.from({ length: 60 }, (_, i) => `${i + 1}. Author A. A cited paper. J Med. 2020.`).join("\n")}`;
    const after = "Data availability\nThe data are on Dryad.\nCompeting interests\nNone declared.";
    const paper = prepared([`${body}\n${references}\n${after}`], 4_000);

    expect(paper.shortened).toBe(true);
    expect(paper.text).toContain("We randomized patients.");
    expect(paper.text).toContain("[References left out]");
    expect(paper.text).not.toContain("A cited paper");
    expect(paper.text).toContain("The data are on Dryad.\nCompeting interests\nNone declared.");
  });

  it("keeps the reference list when the text fits", () => {
    const paper = prepared([`${WORDS(200)}\nReferences\n1. Author A. A cited paper.`]);

    expect(paper.shortened).toBe(false);
    expect(paper.text).toContain("A cited paper");
  });

  it("cuts a text still over the cap at a word boundary, marked, and never passes the cap", () => {
    const paper = prepared([WORDS(5_000, "evidence")], 1_000);

    expect(paper.shortened).toBe(true);
    expect(paper.text.length).toBeLessThanOrEqual(1_000);
    expect(paper.text.endsWith("evidence\n[…]")).toBe(true);
  });

  it("cuts a text with no space to fit, marked, at exactly the cap", () => {
    const paper = prepared(["a".repeat(3_000)], 1_000);

    expect(paper.text).toHaveLength(1_000);
    expect(paper.text.endsWith("a\n[…]")).toBe(true);
  });

  it("gives the same text for the same pages", () => {
    const pages = [WORDS(3_000, "same")];

    expect(preparePaperText(pages, 2_000)).toEqual(preparePaperText(pages, 2_000));
  });
});

describe("normalizeForQuote", () => {
  it("keeps letters and digits, lowercase, with accents, spacing accents and ligatures undone", () => {
    expect(normalizeForQuote("Hoˆpital Garcı´a, 3 eﬃcacy — Straße!")).toBe(
      "hopitalgarcia3efficacystrasse",
    );
  });
});

describe("quoteFound", () => {
  const text = quoteTextOf(prepared(CITICOLINE_PAGES).text);
  const found = (paper: string, quote: string) => quoteFound(quoteTextOf(paper), quote);

  it("finds a quote across a line break, whatever its spaces, case and punctuation", () => {
    expect(quoteFound(text, "Competing interests: NO authors have competing interests.")).toBe(
      true,
    );
    expect(quoteFound(text, "approved by the All India Institute of Medical Sciences")).toBe(true);
    expect(quoteFound(text, "the latter's efficacy being debatable")).toBe(true);
  });

  it("finds a quote whose ligatures or dashes differ from the paper's", () => {
    expect(found("the eﬃcacy—at three months", "the efficacy - at three months")).toBe(true);
  });

  it("finds a quote with accents written apart from their letters, as PDFs often give them", () => {
    expect(
      found(
        "Ministère des Solidarite´s et de la Sante´, Franc¸ois Rannou",
        "Ministère des Solidarités et de la Santé, François Rannou",
      ),
    ).toBe(true);
    expect(
      found(
        "by contacting Esther Lo´ pez-Garcı´a at the Hoˆpital Cochin",
        "by contacting Esther López-García at the Hôpital Cochin",
      ),
    ).toBe(true);
  });

  it("finds a quote whose letters Unicode does not decompose are written another way", () => {
    expect(
      found(
        "Straße, Ørsted, Cæsar, œuvre, Łódź, Đakovo",
        "Strasse, Orsted, Caesar, oeuvre, Lodz, Dakovo",
      ),
    ).toBe(true);
  });

  const SPLIT = [
    "Data Availability Statement: The full original protocol, dataset and statistical codes can be",
    "accessed by academic researchers by contacting",
    "knee pain score was 56.2/100 (SD 13.5) at baseline in the whole sample",
    "the corresponding author, after approval of a proposal.",
  ].join("\n");
  const STATEMENT =
    "The full original protocol, dataset and statistical codes can be accessed by academic researchers by contacting the corresponding author, after approval of a proposal.";

  it("finds a quote that whole lines from another column split, in up to three long passages", () => {
    expect(found(SPLIT, STATEMENT)).toBe(true);
  });

  it("finds a quote that a page header or reference numbers split", () => {
    const paper = [
      "Patients were randomly assigned [12, 13] to citicoline or placebo with a computer-",
      "PLOS ONE | https://doi.org/10.1371/journal.pone.0269224 June 3, 2022 5 / 14",
      "generated sequence of sealed envelopes.",
    ].join("\n");

    expect(
      found(
        paper,
        "Patients were randomly assigned to citicoline or placebo with a computer-generated sequence of sealed envelopes.",
      ),
    ).toBe(true);
  });

  it("finds a quote whose passages lie a page apart, as the box beside a first page leaves them", () => {
    const abstract = Array.from({ length: 60 }, (_, line) => `Abstract line ${line} of the paper.`);
    const paper = [...SPLIT.split("\n").slice(0, 2), ...abstract, SPLIT.split("\n")[3]].join("\n");

    expect(found(paper, STATEMENT)).toBe(true);
  });

  it.each([
    [
      "a word, such as not",
      "The outcome assessors were not blinded to the treatment allocation.",
      "The outcome assessors were blinded to the treatment allocation.",
    ],
    [
      "part of a word",
      "The outcome assessors were unblinded to the treatment allocation.",
      "The outcome assessors were blinded to the treatment allocation.",
    ],
    [
      "words, behind an ellipsis",
      SPLIT,
      "The full original protocol … the corresponding author, after approval of a proposal.",
    ],
  ])("does not find a quote that leaves out %s", (_, paper, quote) => {
    expect(found(paper, quote)).toBe(false);
  });

  it("does not find a quote whose passages come out of order, or over a page apart", () => {
    const first = "The full original protocol, dataset and statistical codes can be";
    const second = "accessed by academic researchers by contacting the corresponding author.";
    const pages = Array.from({ length: 400 }, (_, line) => `Line ${line} of the paper's results.`);

    expect(found(`${second}\n${first}`, `${first} ${second}`)).toBe(false);
    expect(found([first, ...pages, second].join("\n"), `${first} ${second}`)).toBe(false);
  });

  it("does not find a quote that needs more than three passages, or a short one", () => {
    const paper = [
      "alpha bravo charlie delta echo",
      "foxtrot golf hotel india juliet",
      "kilo lima mike november oscar",
      "papa quebec romeo sierra tango",
    ].join("\n");

    expect(
      found(
        paper,
        "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango",
      ),
    ).toBe(true);
    expect(
      found(
        paper.replaceAll("\n", "\nbox\n"),
        "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango",
      ),
    ).toBe(false);
    expect(found(paper, "alpha bravo charlie delta echo papa")).toBe(false);
  });

  it("does not find a quote the paper does not hold", () => {
    expect(quoteFound(text, "The sample size was calculated with a power of 80%.")).toBe(false);
  });

  it("does not take a quote too short to show anything", () => {
    expect(quoteFound(text, "trial")).toBe(false);
    expect(quoteFound(text, "  ")).toBe(false);
  });
});
