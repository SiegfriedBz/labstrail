import { readFileSync } from "node:fs";
import { checklistOf, STUDY_TYPES } from "@verisci/core";
import { describe, expect, it } from "vitest";
import { impliedScore, readReferencePapers } from "./reference-papers.ts";

const PAPERS = readReferencePapers(
  JSON.parse(readFileSync(new URL("./reference-papers.json", import.meta.url), "utf8")),
);
const IN_FIELD = PAPERS.flatMap((paper) => (paper.field === "life-sciences" ? [paper] : []));

describe("reference-papers.json", () => {
  it("holds 12 papers in the field, 2 outside it, each id once", () => {
    expect(IN_FIELD).toHaveLength(12);
    expect(PAPERS.filter((paper) => paper.field === "outside")).toHaveLength(2);
    expect(new Set(PAPERS.map((paper) => paper.id)).size).toBe(PAPERS.length);
  });

  it("covers every study type", () => {
    const types = new Set(IN_FIELD.map((paper) => paper.studyType));

    expect([...types].sort()).toEqual(STUDY_TYPES.map((type) => type.id).sort());
  });

  it.each(IN_FIELD.map((paper) => [paper.id, paper]))(
    "answers exactly the checks of %s's study type, not-applicable only where a check may not apply",
    (_, paper) => {
      const checklist = checklistOf(paper.studyType);

      expect(Object.keys(paper.expectedChecks).sort()).toEqual(
        checklist.map((check) => check.id).sort(),
      );
      for (const check of checklist) {
        if (check.applies === "required") {
          expect(paper.expectedChecks[check.id]).not.toBe("not-applicable");
        }
      }
    },
  );

  it.each(IN_FIELD.map((paper) => [paper.id, paper]))(
    "expects for %s a range that holds the score its expected answers give",
    (_, paper) => {
      const [min, max] = paper.expectedScore;
      const score = impliedScore(paper.studyType, paper.expectedChecks);

      expect(min).toBeLessThanOrEqual(max);
      expect(score).toBeGreaterThanOrEqual(min);
      expect(score).toBeLessThanOrEqual(max);
    },
  );
});

describe("impliedScore", () => {
  it("counts partly as half, leaves out a conditional check that does not apply, and rounds half up", () => {
    // other: 8 checks; 4 conditional ones do not apply; funding shown, methods partly: 1.5 / 4.
    expect(
      impliedScore("other", {
        "methods-described": "partly",
        funding: "shown",
        statistics: "not-applicable",
        ethics: "not-applicable",
        "data-availability": "not-applicable",
        "code-availability": "not-applicable",
      }),
    ).toBe(38);
  });

  it("counts a required check said not to apply, or with no answer, as missing", () => {
    expect(impliedScore("other", { funding: "shown", conflicts: "not-applicable" })).toBe(13);
  });
});

describe("readReferencePapers", () => {
  it("refuses a paper outside the field that expects a score", () => {
    const [outside] = PAPERS.filter((paper) => paper.field === "outside");

    expect(() => readReferencePapers([{ ...outside, expectedScore: [0, 10] }])).toThrow();
  });

  it("refuses a link that is not https", () => {
    expect(() =>
      readReferencePapers([{ ...PAPERS[0], url: "http://example.org/a.pdf" }]),
    ).toThrow();
  });
});
