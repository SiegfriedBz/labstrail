import { describe, expect, it } from "vitest";
import {
  CHECKS,
  checklistFor,
  checklistOf,
  STUDY_TYPES,
  type StudyType,
  studyTypesOf,
} from "./checklists.ts";

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

describe("studyTypesOf", () => {
  it("keeps each kind of study once, in STUDY_TYPES order", () => {
    expect(studyTypesOf(["lab", "animal", "lab"])).toEqual(["animal", "lab"]);
  });

  it("combines the kinds of primary research, and keeps them over a review or other", () => {
    expect(studyTypesOf(["computational", "randomized-trial", "observational"])).toEqual([
      "randomized-trial",
      "observational",
      "computational",
    ]);
    expect(studyTypesOf(["narrative-review", "lab"])).toEqual(["lab"]);
    expect(studyTypesOf(["other", "animal"])).toEqual(["animal"]);
  });

  it("keeps one review or other kind alone, the first in STUDY_TYPES order", () => {
    expect(studyTypesOf(["narrative-review", "systematic-review"])).toEqual(["systematic-review"]);
    expect(studyTypesOf(["other"])).toEqual(["other"]);
  });

  it("drops unknown ids, and gives none when no id is known", () => {
    expect(studyTypesOf(["lab", "cohort"])).toEqual(["lab"]);
    expect(studyTypesOf(["cohort"])).toEqual([]);
    expect(studyTypesOf([])).toEqual([]);
  });
});

describe("checklistFor", () => {
  it("gives one kind's checklist as checklistOf does", () => {
    for (const type of STUDY_TYPES) expect(checklistFor([type.id])).toEqual(checklistOf(type.id));
  });

  it("holds each check once: the first kind's own, the next kind's new ones, then the common checks", () => {
    const ids = checklistFor(["animal", "lab"]).map((check) => check.id);
    const own = (type: StudyType) =>
      checklistOf(type)
        .map((check) => check.id)
        .filter((id) => !COMMON.includes(id));
    const animal = own("animal");
    const labOnly = own("lab").filter((id) => !animal.includes(id));
    const common = checklistOf("animal")
      .map((check) => check.id)
      .filter((id) => COMMON.includes(id));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...animal, ...labOnly, ...common]);
  });

  it("requires a check that one kind requires and another may skip", () => {
    const applies = (id: string) =>
      checklistFor(["animal", "lab"]).find((check) => check.id === id)?.applies;

    expect(checklistOf("lab").find((check) => check.id === "ethics")?.applies).toBe("conditional");
    expect(applies("ethics")).toBe("required");
  });
});
