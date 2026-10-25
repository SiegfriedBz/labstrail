import {
  type CheckAnswer,
  type CheckId,
  type CheckResult,
  checklistFor,
  checklistOf,
  type ScorerOutput,
  type StudyType,
} from "@labstrail/core";
import { describe, expect, it } from "vitest";
import { type ScoredRun, stabilityOf } from "./stability.ts";

const [FIRST, SECOND] = checklistOf("lab").map((check) => check.id) as [CheckId, CheckId];

/** A scored run: every check of `studyType` shown, but those in `changed`. */
function scored(
  score: number,
  studyType: StudyType = "lab",
  changed: Partial<Record<CheckId, Omit<CheckResult, "id">>> = {},
): ScoredRun {
  const checks = checklistOf(studyType).map(
    (check): CheckResult => ({
      id: check.id,
      ...(changed[check.id] ?? { answer: "shown", quote: "q" }),
    }),
  );
  const output: ScorerOutput = { score, rationale: "r", studyTypes: [studyType], checks };
  return { kind: "scored", output };
}

function answered(answer: CheckAnswer) {
  return answer === "shown" || answer === "partly" ? { answer, quote: "q" } : { answer };
}

describe("stabilityOf", () => {
  it("gives a steady study type, the scores in run order and their spread", () => {
    const stability = stabilityOf([60, 62, 60, 65, 61].map((score) => scored(score)));

    expect(stability).toMatchObject({
      runs: 5,
      enough: true,
      fieldSteady: true,
      studyTypeSteady: true,
      studyTypes: { lab: 5 },
      studyType: "lab",
      scores: [60, 62, 60, 65, 61],
      spread: 5,
      answerFlips: [],
      quoteFlips: [],
    });
  });

  it("counts each study type, and compares checks only across the most common one's runs", () => {
    const stability = stabilityOf([
      scored(70, "lab"),
      scored(40, "other"),
      scored(70, "lab"),
      scored(45, "other"),
      scored(70, "lab"),
    ]);

    expect(stability).toMatchObject({
      studyTypeSteady: false,
      studyTypes: { lab: 3, other: 2 },
      studyType: "lab",
      scores: [70, 40, 70, 45, 70],
      spread: 30,
      answerFlips: [],
      quoteFlips: [],
    });
  });

  it("counts each set of study types as one, so a run that adds a kind is not steady", () => {
    const mixed: ScoredRun = {
      kind: "scored",
      output: {
        score: 60,
        rationale: "r",
        studyTypes: ["animal", "lab"],
        checks: checklistFor(["animal", "lab"]).map((check) => ({
          id: check.id,
          answer: "shown",
          quote: "q",
        })),
      },
    };
    const stability = stabilityOf([mixed, scored(70, "lab"), mixed]);

    expect(stability).toMatchObject({
      studyTypeSteady: false,
      studyTypes: { "animal+lab": 2, lab: 1 },
      studyType: "animal+lab",
    });
  });

  it("lists a check Gemini answered differently as an answer flip, with each answer's count", () => {
    const partly = { [FIRST]: answered("partly") };
    const stability = stabilityOf([
      scored(90),
      scored(85, "lab", partly),
      scored(90),
      scored(85, "lab", partly),
      scored(90),
    ]);

    expect(stability.answerFlips).toEqual([
      { id: FIRST, counted: { shown: 3, partly: 2 }, said: { shown: 3, partly: 2 } },
    ]);
    expect(stability.quoteFlips).toEqual([]);
  });

  it("lists a check that lost its point to a quote not found as a quote flip", () => {
    const refused = {
      [SECOND]: { answer: "missing", claimed: { answer: "shown", quote: "not in the paper" } },
    } as const;
    const stability = stabilityOf([
      scored(90),
      scored(80, "lab", refused),
      scored(90),
      scored(90),
      scored(90),
    ]);

    expect(stability.quoteFlips).toEqual([
      { id: SECOND, counted: { shown: 4, missing: 1 }, said: { shown: 5 } },
    ]);
    expect(stability.answerFlips).toEqual([]);
  });

  it("leaves out a check counted the same in every run", () => {
    const missing = { [FIRST]: answered("missing") };
    const stability = stabilityOf([
      scored(80, "lab", missing),
      scored(80, "lab", missing),
      scored(80, "lab", missing),
    ]);

    expect(stability.answerFlips).toEqual([]);
    expect(stability.quoteFlips).toEqual([]);
  });

  it("counts runs that classed the paper outside, and leaves them out of the scores", () => {
    const stability = stabilityOf([
      scored(70),
      { kind: "outside" },
      scored(74),
      { kind: "outside" },
      scored(72),
    ]);

    expect(stability).toMatchObject({
      runs: 5,
      outside: 2,
      fieldSteady: false,
      scores: [70, 74, 72],
      spread: 4,
    });
  });

  it("calls the field steady when every run classed the paper outside", () => {
    const stability = stabilityOf([{ kind: "outside" }, { kind: "outside" }]);

    expect(stability).toMatchObject({ outside: 2, fieldSteady: true, scores: [] });
  });

  it("counts failed runs and leaves them out of the scores and the spread", () => {
    const stability = stabilityOf([
      scored(60),
      { kind: "failed", failure: "scorer unreachable (HTTP 503)" },
      scored(66),
    ]);

    expect(stability).toMatchObject({
      runs: 3,
      failed: 1,
      enough: true,
      scores: [60, 66],
      spread: 6,
    });
  });

  it("says there are not enough runs to compare when fewer than 2 scored", () => {
    const stability = stabilityOf([
      scored(60),
      { kind: "failed", failure: "scorer rate-limited (HTTP 429)" },
    ]);

    expect(stability).toMatchObject({ enough: false, failed: 1, scores: [60] });
    expect(stability.spread).toBeUndefined();
    expect(stability.answerFlips).toEqual([]);
  });
});
