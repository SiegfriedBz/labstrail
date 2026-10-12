import { describe, expect, it } from "vitest";

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

describe("lib's layout", () => {
  it("keeps each flow's modules in its folder, with only shared helpers at the root", () => {
    const files = Object.keys(import.meta.glob("./**/*.ts"));
    const root = ["web-env", "server", "theme", "shorten", "utils", "empty-module", "layout"];

    expect(files.length).toBeGreaterThan(10);
    expect(misplaced(files, root, ["publish", "papers"])).toEqual([]);
  });
});
