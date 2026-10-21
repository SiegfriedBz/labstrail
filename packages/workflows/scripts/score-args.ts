// Dev only: score-papers' arguments, and the request count it may spend.
import { basename } from "node:path";
import { THINKING_LEVELS, type ThinkingLevel } from "../src/gemini/gemini.ts";

/**
 * The free tier's `gemini-3.8-flash` requests a day, for every environment together, since one
 * key serves them all (`docs/domain.md` → Gemini; ADR 0005).
 */
export const DAILY_SCORER_REQUESTS = 20;

const MAX_REPEAT = 10;

/** What a score-papers run does. */
export interface ScoreArgs {
  /** Reference paper ids; none, with no `pdfs`, means every reference paper. */
  readonly ids: readonly string[];
  /** PDFs on disk, scored with no expectations, each named after its file. */
  readonly pdfs: readonly { readonly name: string; readonly path: string }[];
  /** How many times each paper is scored: 1, or 2 to 10 with `--repeat`. */
  readonly repeat: number;
  /** The thinking level each scorer request asks for; without one, the model's default. */
  readonly thinkingLevel?: ThinkingLevel;
  /** The publish run's field check instead of the scorer, on reference papers. */
  readonly field: boolean;
}

/**
 * Reads score-papers' arguments: reference paper ids, `--repeat <2–10>`, `--pdf <path>` (any
 * number of times), `--thinking <low|medium|high>`, and `--field`, which takes none of the
 * scorer's options. Anything else is an error, with what to write instead.
 */
export function parseScoreArgs(
  argv: readonly string[],
):
  | { readonly ok: true; readonly args: ScoreArgs }
  | { readonly ok: false; readonly error: string } {
  const ids: string[] = [];
  const pdfs: { name: string; path: string }[] = [];
  let repeat: number | undefined;
  let thinkingLevel: ThinkingLevel | undefined;
  let field = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    const value = argv[index + 1];
    if (arg === "--field") {
      field = true;
    } else if (arg === "--repeat") {
      index++;
      const times = Number(value);
      if (!Number.isInteger(times) || times < 2 || times > MAX_REPEAT) {
        return { ok: false, error: `--repeat takes a whole number from 2 to ${MAX_REPEAT}` };
      }
      repeat = times;
    } else if (arg === "--pdf") {
      index++;
      if (!value || value.startsWith("--")) return { ok: false, error: "--pdf takes a PDF's path" };
      pdfs.push({ name: basename(value).replace(/\.pdf$/i, ""), path: value });
    } else if (arg === "--thinking") {
      index++;
      const level = THINKING_LEVELS.find((known) => known === value);
      if (!level) return { ok: false, error: "--thinking takes low, medium or high" };
      thinkingLevel = level;
    } else if (arg.startsWith("--")) {
      return { ok: false, error: `Unknown option ${arg}` };
    } else {
      ids.push(arg);
    }
  }
  if (field && (repeat !== undefined || thinkingLevel || pdfs.length > 0)) {
    return {
      ok: false,
      error:
        "--field runs the field check alone, on reference papers: leave out --repeat, --thinking and --pdf",
    };
  }
  return {
    ok: true,
    args: { ids, pdfs, repeat: repeat ?? 1, ...(thinkingLevel ? { thinkingLevel } : {}), field },
  };
}

/**
 * Why a run of `papers` papers, each scored `repeat` times, may not start: it would spend more
 * scorer requests than the free tier allows in a day. Retries after a failure come on top.
 */
export function budgetError(papers: number, repeat: number): string | undefined {
  const requests = papers * repeat;
  if (requests <= DAILY_SCORER_REQUESTS) return undefined;
  return `This run would make ${requests} scorer requests; the free tier allows ${DAILY_SCORER_REQUESTS} a day for every environment together`;
}
