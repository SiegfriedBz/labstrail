import {
  CHECKS,
  type CheckAnswer,
  type CheckResult,
  STUDY_TYPES,
  type StudyType,
} from "@verisci/core";

/** One check as the rating page shows it. */
export interface CheckRow {
  readonly id: string;
  /** What the check asks, as a sentence about the paper. */
  readonly question: string;
  readonly answer: CheckAnswer;
  /** The paper's own words that show it. */
  readonly quote?: string;
  /** For a check that lost its point: what the scorer claimed, and why it didn't count. */
  readonly lost?: { readonly claimed: CheckAnswer; readonly quote?: string; readonly why: string };
}

/** The R-KA's checks as rows, in checklist order (ADR 0018). */
export function checkRows(checks: readonly CheckResult[]): CheckRow[] {
  return checks.map((check) => ({
    id: check.id,
    question: `The paper ${CHECKS[check.id]}`,
    answer: check.answer,
    ...(check.quote === undefined ? {} : { quote: check.quote }),
    ...(check.claimed === undefined
      ? {}
      : {
          lost: {
            claimed: check.claimed.answer,
            ...(check.claimed.quote === undefined ? {} : { quote: check.claimed.quote }),
            why: lostReason(check.claimed),
          },
        }),
  }));
}

/** Why a claimed answer counted as missing (`scoreChecks`). */
function lostReason(claimed: NonNullable<CheckResult["claimed"]>): string {
  if (claimed.answer === "not-applicable") {
    return "The scorer said this doesn't apply, but it always applies, so the check counts as missing.";
  }
  return claimed.quote === undefined
    ? "The scorer gave no passage from the paper to show it, so the check counts as missing."
    : "The scorer quoted a passage that isn't in the paper's text, so the check counts as missing.";
}

/** An answer in plain words. */
export function answerLabel(answer: CheckAnswer): string {
  switch (answer) {
    case "shown":
      return "Shown";
    case "partly":
      return "Partly shown";
    case "missing":
      return "Missing";
    case "not-applicable":
      return "Doesn't apply";
  }
}

/**
 * The animal and lab labels before scorer version 4, which moved invertebrates from `animal`
 * to `lab`: a rating keeps the meaning it was scored with.
 */
const LABELS_BEFORE_V4: Readonly<Partial<Record<StudyType, string>>> = {
  animal: "an experiment on live animals",
  lab: "a laboratory study of cells, tissues, molecules or microbes",
};

/**
 * The kinds of study the scorer read the paper as, and the checklists it held it to (none for
 * `other`), in the words of the scorer version that rated it (`promptVersion`; today's without
 * one); `undefined` for a rating with no study type.
 */
export function studyTypeLine(
  studyTypes: readonly StudyType[] | undefined,
  promptVersion?: string,
): string | undefined {
  const types = STUDY_TYPES.filter((entry) => studyTypes?.includes(entry.id));
  if (types.length === 0) return undefined;
  const beforeV4 = Number(promptVersion) < 4;
  const labels = types.map((type) => (beforeV4 && LABELS_BEFORE_V4[type.id]) || type.label);
  const sources = types.map((type) => type.source).filter((source) => source !== "none");
  const against = sources.length > 0 ? `, against ${listOf(sources)}` : "";
  // The labels hold commas of their own, so the last one takes a comma before its "and".
  return `Read as ${listOf(labels, ", and ")}${against}.`;
}

/** `["a", "b", "c"]` as `a, b and c`, or with `last` before the last item. */
function listOf(items: readonly string[], last = " and "): string {
  return items.length > 1
    ? `${items.slice(0, -1).join(", ")}${last}${items.at(-1)}`
    : items.join("");
}
