import { describe, expect, it } from "vitest";
import { CITICOLINE_PAGES } from "./fixtures/citicoline-pages.ts";
import { normalizeForQuote, preparePaperText, quoteFound } from "./paper-text.ts";

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

describe("quoteFound", () => {
  const text = normalizeForQuote(prepared(CITICOLINE_PAGES).text);

  it("finds a quote across a line break, whatever its spaces, case and punctuation", () => {
    expect(quoteFound(text, "Competing interests: NO authors have competing interests.")).toBe(
      true,
    );
    expect(quoteFound(text, "approved by the All India Institute of Medical Sciences")).toBe(true);
    expect(quoteFound(text, "the latter's efficacy being debatable")).toBe(true);
  });

  it("finds a quote whose ligatures or dashes differ from the paper's", () => {
    expect(
      quoteFound(normalizeForQuote("the eﬃcacy—at three months"), "the efficacy - at three months"),
    ).toBe(true);
  });

  it("finds a quote with accents written apart from their letters, as PDFs often give them", () => {
    const pdf = normalizeForQuote("Ministère des Solidarite´s et de la Sante´, Franc¸ois Rannou");

    expect(quoteFound(pdf, "Ministère des Solidarités et de la Santé, François Rannou")).toBe(true);
  });

  it("finds a quote split by text from another column, in up to three long passages", () => {
    const pdf = normalizeForQuote(
      [
        "Data Availability Statement: The full original protocol, dataset and statistical codes can be",
        "accessed by academic researchers by contacting",
        "knee pain score was 56.2/100 (SD 13.5) at baseline in the whole sample",
        "the corresponding author, after approval of a proposal.",
      ].join("\n"),
    );

    expect(
      quoteFound(
        pdf,
        "The full original protocol, dataset and statistical codes can be accessed by academic researchers by contacting the corresponding author, after approval of a proposal.",
      ),
    ).toBe(true);
    expect(quoteFound(pdf, "The full original protocol … after approval of a proposal.")).toBe(
      true,
    );
  });

  it("does not find a quote that needs more than three passages, or a short one", () => {
    const pdf = normalizeForQuote(
      "alpha bravo charlie delta echo. foxtrot golf hotel india juliet. kilo lima mike november oscar. papa quebec romeo sierra tango.",
    );

    expect(
      quoteFound(
        pdf,
        "alpha bravo charlie delta echo kilo lima mike november oscar foxtrot golf hotel india juliet papa quebec romeo sierra tango",
      ),
    ).toBe(false);
    expect(quoteFound(pdf, "alpha bravo charlie delta echo papa")).toBe(false);
  });

  it("does not find a quote the paper does not hold", () => {
    expect(quoteFound(text, "The sample size was calculated with a power of 80%.")).toBe(false);
  });

  it("does not take a quote too short to show anything", () => {
    expect(quoteFound(text, "trial")).toBe(false);
    expect(quoteFound(text, "  ")).toBe(false);
  });
});
