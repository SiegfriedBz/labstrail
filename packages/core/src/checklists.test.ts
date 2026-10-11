import { describe, expect, it } from "vitest";
import { CHECKS, checklistOf, STUDY_TYPES, type StudyType } from "./checklists.ts";

const COMMON = [
  "data-availability",
  "code-availability",
  "funding",
  "conflicts",
  "ethics",
  "limitations",
];

describe("checklistOf", () => {
  it.each(STUDY_TYPES.map((type) => [type.id]))("gives %s unique checks, each worded", (type) => {
    const ids = checklistOf(type).map((check) => check.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const check of checklistOf(type)) {
      expect(check.label).toBe(CHECKS[check.id]);
      expect(["required", "conditional"]).toContain(check.applies);
    }
  });

  it.each(STUDY_TYPES.map((type) => [type.id]))("includes every common check in %s", (type) => {
    const ids = checklistOf(type).map((check) => check.id);

    expect(ids).toEqual(expect.arrayContaining(COMMON));
  });

  it("asks for a registration in trials and systematic reviews, maybe in observational studies", () => {
    const registration = (type: StudyType) =>
      checklistOf(type).find((check) => check.id === "registration")?.applies;

    expect(registration("randomized-trial")).toBe("required");
    expect(registration("systematic-review")).toBe("required");
    expect(registration("observational")).toBe("conditional");
    expect(registration("lab")).toBeUndefined();
  });

  it("requires ethics approval for studies of people and animals only", () => {
    const ethics = (type: StudyType) =>
      checklistOf(type).find((check) => check.id === "ethics")?.applies;

    expect((["randomized-trial", "observational", "animal"] as const).map(ethics)).toEqual([
      "required",
      "required",
      "required",
    ]);
    expect((["lab", "narrative-review", "computational", "other"] as const).map(ethics)).toEqual([
      "conditional",
      "conditional",
      "conditional",
      "conditional",
    ]);
  });

  it("keeps each study type's checks, in order, so a change is deliberate", () => {
    const lists = Object.fromEntries(
      STUDY_TYPES.map((type) => [
        type.id,
        checklistOf(type.id).map(
          (check) => `${check.id}${check.applies === "conditional" ? "?" : ""}`,
        ),
      ]),
    );

    expect(lists).toMatchInlineSnapshot(`
      {
        "animal": [
          "subjects",
          "sample-size",
          "randomization",
          "blinding",
          "inclusion-exclusion",
          "exact-n",
          "statistics",
          "ethics",
          "data-availability",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "computational": [
          "data-source",
          "software-identified",
          "parameters",
          "validation",
          "uncertainty",
          "baseline",
          "ethics?",
          "data-availability",
          "code-availability",
          "funding",
          "conflicts",
          "limitations",
        ],
        "lab": [
          "resources-identified",
          "software-identified?",
          "cell-line-authentication?",
          "replicates",
          "statistics",
          "randomization?",
          "blinding?",
          "sex-variable?",
          "ethics?",
          "data-availability",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "narrative-review": [
          "importance",
          "aims",
          "search",
          "referencing",
          "reasoning",
          "data-presentation",
          "ethics?",
          "data-availability?",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "observational": [
          "design-setting",
          "eligibility",
          "sample-size",
          "confounding",
          "missing-data",
          "participant-flow",
          "effect-estimates",
          "registration?",
          "ethics",
          "data-availability",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "other": [
          "methods-described",
          "statistics?",
          "ethics?",
          "data-availability?",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "randomized-trial": [
          "sample-size",
          "randomization",
          "allocation-concealment",
          "blinding",
          "primary-outcome",
          "participant-flow",
          "effect-estimates",
          "harms",
          "registration",
          "ethics",
          "data-availability",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
        "systematic-review": [
          "search",
          "eligibility",
          "selection",
          "risk-of-bias",
          "synthesis",
          "study-flow",
          "registration",
          "ethics?",
          "data-availability",
          "code-availability?",
          "funding",
          "conflicts",
          "limitations",
        ],
      }
    `);
  });
});
