import { describe, expect, it } from "vitest";
import { completeTitle } from "./title.ts";

const CUT = "by RNA sequence, structure, and cell-type-specific features";
const FULL =
  "PUS7 mRNA pseudouridylation is driven by RNA sequence, structure, and cell-type-specific features";

describe("completeTitle", () => {
  it("takes the PDF's stored title when GROBID's is its end, cut from it", () => {
    expect(completeTitle(CUT, FULL)).toBe(FULL);
  });

  it("collapses the stored title's whitespace", () => {
    expect(completeTitle(CUT, `  PUS7 mRNA pseudouridylation\n is driven ${CUT} `)).toBe(FULL);
  });

  it("keeps GROBID's when the stored one differs only in case, spacing or a final full stop", () => {
    expect(completeTitle(FULL, FULL.toUpperCase())).toBe(FULL);
    expect(completeTitle(FULL, `${FULL.replaceAll(" ", "  ")}.`)).toBe(FULL);
    expect(completeTitle(`${FULL}.`, FULL)).toBe(`${FULL}.`);
  });

  it("completes a title GROBID ended with a full stop, matching whatever the case", () => {
    expect(completeTitle(`${CUT.toUpperCase()}.`, FULL)).toBe(FULL);
  });

  it.each([
    ["a file name", "Microsoft Word - draft.docx"],
    ["a journal's name", "Cell Genomics"],
    ["another paper's title", "Nanopore sequencing of pseudouridine in human cells"],
    ["one that holds GROBID's title but does not end with it", `${FULL}: a preprint`],
    ["one that ends with GROBID's title inside a word", `Nearby ${CUT.slice("by ".length)}`],
  ])("keeps GROBID's when the stored title is %s", (_, stored) => {
    expect(completeTitle(CUT, stored)).toBe(CUT);
  });

  it.each([
    ["a spaced hyphen", `Cell Genomics - ${FULL}`],
    ["a spaced en dash", `Cell Genomics – ${FULL}`],
    ["a spaced em dash", `Cell Genomics — ${FULL}`],
    ["a bar", `Cell Genomics | ${FULL}`],
    ["an unspaced en dash", `Cell Genomics–${FULL}`],
    ["an unspaced em dash", `Cell Genomics—${FULL}`],
  ])(
    "keeps GROBID's when the stored words before it end with %s, as a journal's name does",
    (_, stored) => {
      expect(completeTitle(FULL, stored)).toBe(FULL);
    },
  );

  it.each([
    ["a spaced hyphen", `Cell Genomics - ${FULL}`],
    ["a spaced en dash", `Cell Genomics – ${FULL}`],
    ["a bar", `Cell Genomics | ${FULL}`],
  ])(
    "keeps GROBID's cut title when the stored words before it hold a journal's name and %s",
    (_, stored) => {
      expect(completeTitle(CUT, stored)).toBe(CUT);
    },
  );

  it("completes a title cut after a colon or inside a hyphenated word", () => {
    const trial = "a randomised trial of citicoline after acute stroke";

    expect(completeTitle(trial, `Neuroprotection: ${trial}`)).toBe(`Neuroprotection: ${trial}`);
    expect(completeTitle("term outcomes of stroke", "Long-term outcomes of stroke")).toBe(
      "Long-term outcomes of stroke",
    );
  });

  it("completes a title whose dropped words hold a full stop or an en dash between two words", () => {
    expect(completeTitle("coli toxins in the gut", "E. coli toxins in the gut")).toBe(
      "E. coli toxins in the gut",
    );
    expect(
      completeTitle("relationship of citicoline", "Dose–response relationship of citicoline"),
    ).toBe("Dose–response relationship of citicoline");
  });

  it("keeps GROBID's when the stored title is over 300 characters", () => {
    const long = `${"A study of ".repeat(30)}${CUT}`;

    expect(long.length).toBeGreaterThan(300);
    expect(completeTitle(CUT, long)).toBe(CUT);
    expect(completeTitle(CUT, `${"x".repeat(300 - CUT.length - 1)} ${CUT}`)).toHaveLength(300);
  });

  it("keeps GROBID's when the PDF stores no title", () => {
    expect(completeTitle(CUT, undefined)).toBe(CUT);
    expect(completeTitle(CUT, "  ")).toBe(CUT);
    expect(completeTitle(".", FULL)).toBe(".");
  });
});
