// Dev only: scores the reference papers (reference-papers.json) as a rating run would, reading
// each PDF's text and asking Gemini for its field, study type and checks in one request, and
// prints how each compares with what is expected. It never publishes, stores or rates anything.
//
//   pnpm --filter @verisci/workflows score-papers [id…]
//
// Reads GEMINI_API_KEY from the root .env.local (packages/workflows README). Downloads each PDF
// once into node_modules/.cache/verisci-reference/, and writes each run's answers there too.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { type PaperText, type ScorerAnswer, type ScorerOutput, scoreChecks } from "@verisci/core";
import { createSharedEnv, defineEnv } from "@verisci/env";
import { z } from "zod";
import { paperTextOf } from "../src/rating/paper-text.ts";
import { RATING_SETTINGS } from "../src/rating/rate-paper.ts";
import { askScorer, type ScoreFailureResult } from "../src/rating/scorer.ts";
import { type ReferencePaper, readReferencePapers } from "./reference-papers.ts";

const CACHE = new URL("../node_modules/.cache/verisci-reference/", import.meta.url);
/** Gemini's free tier answers a burst with 429s: wait between calls, and retry a few times. */
const PAUSE_MS = 5_000;
const RETRY_WAIT_MS = 30_000;
const TRIES = 3;

const shared = createSharedEnv();
if (shared.APP_ENV !== "local") {
  console.error("score-papers runs only with APP_ENV=local");
  process.exit(1);
}
const env = defineEnv({
  extends: [shared],
  server: { GEMINI_API_KEY: z.string().min(1) },
  runtimeEnv: process.env,
});
const gemini = {
  apiKey: env.GEMINI_API_KEY,
  model: RATING_SETTINGS.model,
  fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
};

const all = readReferencePapers(
  JSON.parse(await readFile(new URL("./reference-papers.json", import.meta.url), "utf8")),
);
const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !all.some((paper) => paper.id === id));
if (unknown.length > 0) {
  console.error(`Not in reference-papers.json: ${unknown.join(", ")}`);
  process.exit(1);
}
const papers = wanted.length > 0 ? all.filter((paper) => wanted.includes(paper.id)) : all;
await mkdir(CACHE, { recursive: true });

/** What the scorer gave for one paper: its classification, Gemini's answers and the score. */
interface Found {
  readonly id: string;
  readonly expected: string;
  readonly found?: string;
  readonly range?: readonly [number, number];
  /** Gemini's answer before its quotes were checked against the paper. */
  readonly asked?: ScorerAnswer;
  /** How long Gemini took, retries and pauses included, in seconds. */
  readonly seconds?: number;
  readonly output?: ScorerOutput;
  readonly failure?: string;
}

const results: Found[] = [];
for (const paper of papers) {
  const result = await score(paper);
  results.push(result);
  report(paper, result);
}
summarize(results);
const file = new URL(`results-${new Date().toISOString().replaceAll(":", "-")}.json`, CACHE);
await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nAnswers written to ${file.pathname}`);

async function score(paper: ReferencePaper): Promise<Found> {
  const expected = paper.field === "outside" ? "outside" : paper.studyType;
  const base = {
    id: paper.id,
    expected,
    ...(paper.expectedScore ? { range: paper.expectedScore } : {}),
  };
  const text = await paperText(paper);
  if (!text.ok) return { ...base, failure: text.failure };

  const started = Date.now();
  const asked = await withRetries(() =>
    askScorer(text.paper, { ...gemini, timeoutMs: RATING_SETTINGS.scorerTimeoutMs }),
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  if (!asked.ok) return { ...base, seconds, failure: `scorer ${describe(asked)}` };
  const { answer } = asked;
  if (answer.field === "outside") return { ...base, found: "outside", seconds };
  const output = scoreChecks(text.paper, answer);
  return { ...base, found: answer.studyType, seconds, asked: answer, output };
}

/** The paper's text, from its PDF downloaded once into the cache. */
async function paperText(
  paper: ReferencePaper,
): Promise<{ ok: true; paper: PaperText } | { ok: false; failure: string }> {
  const path = new URL(`${paper.id}.pdf`, CACHE);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    const response = await fetch(paper.url, { signal: AbortSignal.timeout(120_000) }).catch(
      () => undefined,
    );
    if (!response?.ok) {
      return { ok: false, failure: `download failed (${response?.status ?? "no answer"})` };
    }
    bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  const text = await paperTextOf(bytes, RATING_SETTINGS.maxTextChars);
  return text.ok ? text : { ok: false, failure: "the PDF has no readable text" };
}

/** Calls Gemini, retrying a rate limit, an outage or an answer that did not parse. */
async function withRetries<T extends { ok: true } | ScoreFailureResult>(call: () => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    const result = await call();
    if (result.ok || result.reason === "refused" || attempt === TRIES) return result;
    console.error(`  Gemini: ${result.reason}, trying again in ${RETRY_WAIT_MS / 1000} s`);
    await sleep(RETRY_WAIT_MS);
  }
}

function describe(failure: ScoreFailureResult): string {
  return failure.status === undefined
    ? failure.reason
    : `${failure.reason} (HTTP ${failure.status})`;
}

/** One paper's line, then each check answered otherwise than expected. */
function report(paper: ReferencePaper, result: Found): void {
  const type =
    result.found === result.expected
      ? result.expected
      : `${result.expected} → ${result.found ?? "?"}`;
  const range = result.range ? `${result.range[0]}–${result.range[1]}` : "outside";
  const verdict = result.failure
    ? `FAILED: ${result.failure}`
    : result.output
      ? inRange(result)
        ? "in range"
        : "OUT OF RANGE"
      : result.found === result.expected
        ? "right"
        : "WRONG";
  const score = result.output?.score ?? "-";
  const took = result.seconds === undefined ? "" : ` · ${result.seconds} s`;
  console.log(
    `\n${paper.id}\n  type ${type} · expected ${range} · score ${score} · ${verdict}${took}`,
  );
  if (!paper.expectedChecks || !result.output) return;
  for (const check of result.output.checks) {
    const expected = paper.expectedChecks[check.id];
    const said = result.asked?.checks.find((asked) => asked.id === check.id);
    const dropped = said && said.answer !== check.answer ? said : undefined;
    if (expected === check.answer && !dropped) continue;
    const quote = dropped?.quote ?? check.quote;
    const note = dropped
      ? ` (Gemini said ${dropped.answer}; quote not found${quote ? `: "${clip(quote)}"` : ""})`
      : quote
        ? ` ("${clip(quote)}")`
        : "";
    console.log(`  ${check.id}: expected ${expected}, scored ${check.answer}${note}`);
  }
}

function clip(text: string): string {
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function inRange(result: Found): boolean {
  const { range, output } = result;
  return Boolean(range && output && output.score >= range[0] && output.score <= range[1]);
}

function summarize(found: readonly Found[]): void {
  const inField = found.filter((result) => result.expected !== "outside");
  const outside = found.filter((result) => result.expected === "outside");
  const count = (list: readonly Found[], test: (result: Found) => boolean) =>
    list.filter(test).length;
  console.log("\nSummary");
  console.log(
    `  outside the field, classified outside: ${count(outside, (r) => r.found === "outside")} of ${outside.length}`,
  );
  console.log(
    `  study type right: ${count(inField, (r) => r.found === r.expected)} of ${inField.length}`,
  );
  console.log(`  score in its range: ${count(inField, inRange)} of ${inField.length}`);
  const failed = found.filter((result) => result.failure);
  if (failed.length > 0) console.log(`  failed: ${failed.map((r) => r.id).join(", ")}`);
}
