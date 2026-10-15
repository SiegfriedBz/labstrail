import { describe, expect, it } from "vitest";
import * as workflows from "./index.ts";

declare global {
  interface ImportMeta {
    /** Vite's glob import, resolved by Vitest when it loads the test; only its keys are read. */
    glob(pattern: string): Record<string, unknown>;
  }
}

/**
 * The files at the root other than `root`'s modules, settings modules (`*-env.ts`) and their
 * tests, or in another folder.
 */
function misplaced(files: readonly string[], root: readonly string[], folders: readonly string[]) {
  return files
    .map((file) => file.replace(/^\.\//, ""))
    .filter((file) => {
      const [first = "", ...rest] = file.split("/");
      if (rest.length > 0) return !folders.includes(first);
      const name = first.replace(/(\.test)?\.ts$/, "");
      return !root.includes(name) && !name.endsWith("-env");
    });
}

describe("workflows' layout", () => {
  it("exports the same names from its entry", () => {
    expect(Object.keys(workflows).sort()).toEqual([
      "ORACLE_SETTINGS",
      "PAPER_SUBMITTED",
      "PUBLISH_SETTINGS",
      "RATING_REQUESTED",
      "RATING_SETTINGS",
      "UPLOAD_SETTINGS",
      "checkRatingSettings",
      "createRatingEnv",
      "createWorkflowsEnv",
      "describeFailure",
      "functions",
      "getRatingService",
      "getUploadService",
      "inngest",
      "oracleTransaction",
      "publishFailureReason",
      "publishPaper",
      "ratePaper",
      "ratingFailureReason",
      "ratingRequestedEvent",
      "ratingSettingsRequired",
      "servedFunctions",
      "servesRating",
      "summariseRatings",
      "workflowsName",
    ]);
  });

  it("keeps every source file in a feature folder, with only the entry, settings and wiring at the root", () => {
    const files = Object.keys(import.meta.glob("./**/*.ts"));
    const root = ["index", "env", "functions", "inngest", "layout"];

    expect(files.length).toBeGreaterThan(20);
    expect(misplaced(files, root, ["publish", "rating", "pdf", "site", "gemini"])).toEqual([]);
  });
});
