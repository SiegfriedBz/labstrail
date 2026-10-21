// Dev only: how far repeated scorer runs on one paper agree, for score-papers --repeat.
import type { CheckAnswer, CheckId, ScorerOutput, StudyType } from "@verisci/core";

/** One scorer run on a paper: scored in the field, classed outside it, or failed. */
export type ScoredRun =
  | { readonly kind: "scored"; readonly output: ScorerOutput }
  | { readonly kind: "outside" }
  | { readonly kind: "failed"; readonly failure: string };

/** How many runs gave each answer. */
export type AnswerCounts = Readonly<Partial<Record<CheckAnswer, number>>>;

/** A check counted differently across runs of one study type. */
export interface Flip {
  readonly id: CheckId;
  /** The answers the score counted. */
  readonly counted: AnswerCounts;
  /** The answers Gemini gave, before its quotes were checked. */
  readonly said: AnswerCounts;
}

/** How far a paper's runs agree ({@link stabilityOf}). */
export interface Stability {
  readonly runs: number;
  readonly failed: number;
  readonly outside: number;
  /** Every run that answered put the paper on the same side of the field. */
  readonly fieldSteady: boolean;
  /** At least 2 runs scored, so there is something to compare. */
  readonly enough: boolean;
  readonly studyTypes: Readonly<Partial<Record<StudyType, number>>>;
  readonly studyTypeSteady: boolean;
  /** The study type most runs found (the first found on a tie), whose runs checks compare. */
  readonly studyType?: StudyType;
  /** Every scored run's score, in run order. */
  readonly scores: readonly number[];
  /** The highest score less the lowest, when {@link Stability.enough}. */
  readonly spread?: number;
  /** Checks Gemini itself answered differently. */
  readonly answerFlips: readonly Flip[];
  /** Checks Gemini answered the same, whose point a quote not found took in some runs. */
  readonly quoteFlips: readonly Flip[];
}

/**
 * Summarises repeated runs of one paper: failed runs and runs classed outside the field are
 * counted and left out of the scores; the study types are counted; and the checks are compared
 * across the runs of the most common study type, each check counted differently listed as an
 * answer flip when Gemini's own answers differ, or as a quote flip when only the quote check
 * (`claimed`) made them differ.
 */
export function stabilityOf(runs: readonly ScoredRun[]): Stability {
  const outputs = runs.flatMap((run) => (run.kind === "scored" ? [run.output] : []));
  const outside = runs.filter((run) => run.kind === "outside").length;
  const failed = runs.filter((run) => run.kind === "failed").length;
  const studyTypes = count(outputs.map((output) => output.studyType));
  const studyType = mostCommon(outputs.map((output) => output.studyType));
  const scores = outputs.map((output) => output.score);
  const enough = outputs.length >= 2;
  const compared = enough ? outputs.filter((output) => output.studyType === studyType) : [];
  const flips = flipsOf(compared);
  return {
    runs: runs.length,
    failed,
    outside,
    fieldSteady: outside === 0 || outputs.length === 0,
    enough,
    studyTypes,
    studyTypeSteady: Object.keys(studyTypes).length <= 1,
    ...(studyType ? { studyType } : {}),
    scores,
    ...(enough ? { spread: Math.max(...scores) - Math.min(...scores) } : {}),
    answerFlips: flips.filter((flip) => Object.keys(flip.said).length > 1),
    quoteFlips: flips.filter((flip) => Object.keys(flip.said).length === 1),
  };
}

/** Each check counted differently across `outputs`, all of one study type, in checklist order. */
function flipsOf(outputs: readonly ScorerOutput[]): Flip[] {
  const [first] = outputs;
  if (!first) return [];
  return first.checks.flatMap(({ id }) => {
    const results = outputs.flatMap((output) => output.checks.filter((check) => check.id === id));
    const counted = count(results.map((check) => check.answer));
    if (Object.keys(counted).length <= 1) return [];
    const said = count(results.map((check) => check.claimed?.answer ?? check.answer));
    return [{ id, counted, said }];
  });
}

function count<T extends string>(values: readonly T[]): Partial<Record<T, number>> {
  const counts: Partial<Record<T, number>> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function mostCommon<T extends string>(values: readonly T[]): T | undefined {
  const counts = count(values);
  let best: T | undefined;
  for (const value of values) {
    if (best === undefined || (counts[value] ?? 0) > (counts[best] ?? 0)) best = value;
  }
  return best;
}
