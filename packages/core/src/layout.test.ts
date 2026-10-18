import { describe, expect, it } from "vitest";
import * as core from "./index.ts";

declare global {
  interface ImportMeta {
    /** Vite's glob import, resolved by Vitest when it loads the test; only its keys are read. */
    glob(pattern: string): Record<string, unknown>;
  }
}

/** The files at the root other than `root`'s modules (and their tests), or in another folder. */
function misplaced(files: readonly string[], root: readonly string[], folders: readonly string[]) {
  return files
    .map((file) => file.replace(/^\.\//, ""))
    .filter((file) => {
      const [first = "", ...rest] = file.split("/");
      if (rest.length > 0) return !folders.includes(first);
      return !root.includes(first.replace(/(\.test)?\.ts$/, ""));
    });
}

describe("core's layout", () => {
  it("exports the same names from its entry", () => {
    expect(Object.keys(core).sort()).toEqual([
      "BASE_SEPOLIA_CHAIN_ID",
      "CHECKS",
      "CHECK_ANSWERS",
      "FIELDS",
      "FIELD_OUTPUT_SCHEMA",
      "FIELD_RULE",
      "MAX_PDF_BYTES",
      "ORIGINTRAIL_CONTRACTS",
      "SCORER_OUTPUT_SCHEMA",
      "SCORER_PROMPT_VERSION",
      "STUDY_TYPES",
      "SUBMISSION_DOMAIN",
      "VERISCI_NS",
      "canonicalCid",
      "canonicalContextGraph",
      "checklistOf",
      "checklistScore",
      "classifyTarget",
      "completeTitle",
      "coreName",
      "fieldCheckPrompt",
      "formatUal",
      "isSameUal",
      "knowledgeAssetToken",
      "normalizeForQuote",
      "normalizeUal",
      "paperAuthorsQuery",
      "paperCountQuery",
      "paperHeadOf",
      "paperListQuery",
      "paperPdfQuery",
      "paperRecordQuery",
      "parseFieldAnswer",
      "parsePaperAuthors",
      "parsePaperCount",
      "parsePaperListing",
      "parsePaperRecord",
      "parsePublishedAt",
      "parseRating",
      "parseScorerAnswer",
      "parseTeiHeader",
      "parseUal",
      "pdfCidOf",
      "preparePaperText",
      "publishedPaperQuery",
      "quoteFound",
      "quoteTextOf",
      "rKaName",
      "rKaQuads",
      "ratingQuery",
      "scoreChecks",
      "scorerPrompt",
      "submissionTypedData",
      "targetKaName",
      "targetKaQuads",
      "triplesFromBindings",
    ]);
  });

  it("keeps every source file in a feature folder, with only the entry at the root", () => {
    const files = Object.keys(import.meta.glob("./**/*.ts"));

    expect(files.length).toBeGreaterThan(20);
    expect(
      misplaced(files, ["index", "layout"], ["assets", "publish", "papers", "rating", "fixtures"]),
    ).toEqual([]);
  });
});
