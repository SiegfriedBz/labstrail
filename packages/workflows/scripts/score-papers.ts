// Dev only: scores the reference papers (reference-papers.json) as a rating run would, reading
// each PDF's text and asking Gemini for its field, study type and checks in one request, and
// prints how each compares with what is expected. It never publishes, stores or rates anything.
// With --repeat, it scores each paper several times and prints how far the runs agree; with
// --pdf, it also scores a PDF on disk, which has no expectations; with --thinking, each scorer
// request asks for that thinking level. With --field, it runs only the publish run's field
// check instead: GROBID's header and the text's opening, then one Flash-Lite request per paper.
//
//   pnpm --filter @verisci/workflows score-papers [--repeat n] [--pdf path…] [--thinking level] [id…]
//   pnpm --filter @verisci/workflows score-papers --field [id…]
//
// Reads GEMINI_API_KEY (and GROBID_URL with --field, with DKG_TOKEN as GROBID's credential on
// the node server) from the root .env.local (packages/workflows README). Refuses a run that
// would spend more than the free tier's daily scorer requests. Downloads each PDF once into
// node_modules/.cache/verisci-reference/, and writes each run's answers there too, after each
// paper (each run with --repeat), so a run that stops keeps the answers it paid for.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type CheckResult,
  type PaperText,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
} from "@verisci/core";
import { createSharedEnv, defineEnv } from "@verisci/env";
import { z } from "zod";
import type { GeminiFailureResult } from "../src/gemini/gemini.ts";
import { paperTextOf } from "../src/pdf/paper-text.ts";
import { checkField } from "../src/publish/field-check.ts";
import { PUBLISH_SETTINGS } from "../src/publish/publish-paper.ts";
import { readPaper } from "../src/publish/read-paper.ts";
import { RATING_SETTINGS } from "../src/rating/rate-paper.ts";
import { askScorer } from "../src/rating/scorer.ts";
import { geminiSchema } from "../src/workflows-env.ts";
import { type ReferencePaper, readReferencePapers } from "./reference-papers.ts";
import { budgetError, parseScoreArgs } from "./score-args.ts";
import { type ScoredRun, type Stability, stabilityOf } from "./stability.ts";

const CACHE = new URL("../node_modules/.cache/verisci-reference/", import.meta.url);
/**
 * Gemini's free tier answers a burst with 429s: wait between calls, and retry a few times. An
 * answer the check refuses is asked for again only as often as a rating run does.
 */
const PAUSE_MS = 5_000;
const RETRY_WAIT_MS = 30_000;
const TRIES = 3;

const shared = createSharedEnv();
if (shared.APP_ENV !== "local") {
  console.error("score-papers runs only with APP_ENV=local");
  process.exit(1);
}
// pnpm runs the script in its workspace; INIT_CWD is where the command was typed.
const parsed = parseScoreArgs(process.argv.slice(2), process.env.INIT_CWD ?? process.cwd());
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}
const { args } = parsed;
const env = defineEnv({
  extends: [shared],
  server: {
    ...geminiSchema,
    GROBID_URL: args.field ? z.url() : z.string().optional(),
    DKG_TOKEN: z.string().optional(),
  },
  runtimeEnv: process.env,
});
const gemini = {
  apiKey: env.GEMINI_API_KEY,
  model: RATING_SETTINGS.model,
  fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
  ...(args.thinkingLevel ? { thinkingLevel: args.thinkingLevel } : {}),
};

const all = readReferencePapers(
  JSON.parse(await readFile(new URL("./reference-papers.json", import.meta.url), "utf8")),
);
const unknown = args.ids.filter((id) => !all.some((paper) => paper.id === id));
if (unknown.length > 0) {
  console.error(`Not in reference-papers.json: ${unknown.join(", ")}`);
  process.exit(1);
}
const chosen = args.ids.length > 0 || args.pdfs.length > 0;
const papers = chosen ? all.filter((paper) => args.ids.includes(paper.id)) : all;
await mkdir(CACHE, { recursive: true });

/** A paper to score: a reference paper, with what is expected of it, or a PDF on disk. */
interface Target {
  readonly id: string;
  readonly reference?: ReferencePaper;
  /** The PDF, from the cache or the paper's URL, or from disk; or why not. */
  readonly bytes: () => Promise<Uint8Array | string>;
}

/** What the scorer gave for one paper: its classification, Gemini's answers and the score. */
interface Found {
  readonly id: string;
  /** The study types expected, joined with `+` (`animal+lab`), or `outside`; none for a PDF on disk. */
  readonly expected?: string;
  readonly found?: string;
  readonly range?: readonly [number, number];
  /** Gemini's answer before its quotes were checked against the paper. */
  readonly asked?: ScorerAnswer;
  /** How long Gemini took, retries and pauses included, in seconds. */
  readonly seconds?: number;
  readonly output?: ScorerOutput;
  readonly failure?: string;
}

const file = new URL(
  `${args.field ? "field" : "results"}-${new Date().toISOString().replaceAll(":", "-")}.json`,
  CACHE,
);
if (args.field) {
  await checkFields(papers);
  process.exit(0);
}
const targets: Target[] = [
  ...papers.map((paper) => ({ id: paper.id, reference: paper, bytes: () => pdfBytes(paper) })),
  ...args.pdfs.map((pdf) => ({ id: pdf.name, bytes: () => pdfOnDisk(pdf.path) })),
];
const tooMany = budgetError(targets.length, args.repeat);
if (tooMany) {
  console.error(tooMany);
  process.exit(1);
}
console.log(
  `Scoring ${targets.length} paper(s) × ${args.repeat} run(s) = ${targets.length * args.repeat} scorer request(s), thinking level ${args.thinkingLevel ?? "the model's default"}`,
);
if (args.repeat === 1) {
  const results: Found[] = [];
  for (const target of targets) {
    const result = await scoreOrStop(target);
    results.push(result);
    report(target, result);
    await writeFile(file, `${JSON.stringify(results, null, 2)}\n`);
  }
  summarize(results);
} else {
  const repeated: { id: string; runs: Found[]; stability: Stability }[] = [];
  for (const target of targets) {
    const entry = { id: target.id, runs: [] as Found[], stability: stabilityOf([]) };
    repeated.push(entry);
    for (let run = 1; run <= args.repeat; run++) {
      const result = await scoreOrStop(target);
      entry.runs.push(result);
      entry.stability = stabilityOf(entry.runs.map(runOf));
      console.log(`\nRun ${run} of ${args.repeat}`);
      report(target, result);
      await writeFile(file, `${JSON.stringify(repeated, null, 2)}\n`);
    }
    console.log(`\n${target.id}: ${args.repeat} runs`);
    for (const line of describe(entry.stability)) console.log(`  ${line}`);
  }
}
console.log(`\nAnswers written to ${file.pathname}`);

function scoreOrStop(target: Target): Promise<Found> {
  return score(target).catch(
    (error: unknown): Found => ({ ...baseOf(target), failure: `stopped: ${String(error)}` }),
  );
}

function baseOf(target: Target) {
  const paper = target.reference;
  if (!paper) return { id: target.id };
  return {
    id: paper.id,
    expected: paper.field === "outside" ? "outside" : paper.studyTypes.join("+"),
    ...(paper.expectedScore ? { range: paper.expectedScore } : {}),
  };
}

async function score(target: Target): Promise<Found> {
  const base = baseOf(target);
  const text = await paperText(target);
  if (!text.ok) return { ...base, failure: text.failure };

  const started = Date.now();
  const asked = await withRetries(() =>
    askScorer(text.paper, { ...gemini, timeoutMs: RATING_SETTINGS.scorerTimeoutMs }),
  );
  const seconds = Math.round((Date.now() - started) / 1000);
  if (!asked.ok) return { ...base, seconds, failure: `scorer ${failureOf(asked)}` };
  const { answer } = asked;
  if (answer.field === "outside") return { ...base, found: "outside", seconds, asked: answer };
  const output = scoreChecks(text.paper, answer);
  return { ...base, found: answer.studyTypes.join("+"), seconds, asked: answer, output };
}

/** One run as {@link stabilityOf} compares it. */
function runOf(result: Found): ScoredRun {
  if (result.output) return { kind: "scored", output: result.output };
  if (result.found === "outside") return { kind: "outside" };
  return { kind: "failed", failure: result.failure ?? "no answer" };
}

/** What the field check gave for one paper. */
interface FieldFound {
  readonly id: string;
  readonly expected: "life-sciences" | "outside";
  readonly found?: string;
  readonly reason?: string;
  readonly failure?: string;
}

/**
 * Runs the publish run's field check on each paper, reading it as the publish run does
 * (`readPaper`: GROBID's header and the opening of the text) from the cached PDF, then
 * `checkField`, and prints the expected and the found field.
 */
async function checkFields(list: readonly ReferencePaper[]): Promise<void> {
  const found: FieldFound[] = [];
  for (const paper of list) {
    const result = await checkOne(paper).catch(
      (error: unknown): FieldFound => ({
        id: paper.id,
        expected: paper.field,
        failure: `stopped: ${String(error)}`,
      }),
    );
    found.push(result);
    const verdict = result.failure
      ? `FAILED: ${result.failure}`
      : result.found === result.expected
        ? "right"
        : "WRONG";
    console.log(
      `\n${paper.id}\n  expected ${result.expected} · found ${result.found ?? "-"} · ${verdict}`,
    );
    if (result.reason) console.log(`  ${result.reason}`);
    await writeFile(file, `${JSON.stringify(found, null, 2)}\n`);
  }
  const right = found.filter((result) => result.found === result.expected).length;
  console.log(`\nSummary\n  field right: ${right} of ${found.length}`);
  console.log(`\nAnswers written to ${file.pathname}`);
}

async function checkOne(paper: ReferencePaper): Promise<FieldFound> {
  const base = { id: paper.id, expected: paper.field };
  const bytes = await pdfBytes(paper);
  if (typeof bytes === "string") return { ...base, failure: bytes };
  // readPaper fetches by CID from the gateway: the cached PDF stands in for it.
  const gatewayUrl = "https://cache.invalid";
  const read = await readPaper("cached", {
    gatewayUrl,
    grobidUrl: String(env.GROBID_URL),
    token: env.DKG_TOKEN,
    fetch: async (input: string | URL | Request, init?: RequestInit) =>
      String(input).startsWith(gatewayUrl)
        ? new Response(bytes.slice() as Uint8Array<ArrayBuffer>)
        : fetch(input, init),
    maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
    timeoutMs: 120_000,
    openingChars: PUBLISH_SETTINGS.openingChars,
  });
  if (!read.ok) return { ...base, failure: `read ${read.reason}` };
  const { title, abstract } = read.metadata;
  const checked = await withRetries(() =>
    checkField(
      { title, ...(abstract ? { abstract } : {}), opening: read.opening },
      { ...gemini, model: PUBLISH_SETTINGS.fieldModel, timeoutMs: PUBLISH_SETTINGS.fieldTimeoutMs },
    ),
  );
  if (!checked.ok) return { ...base, failure: `field check ${failureOf(checked)}` };
  return { ...base, found: checked.field, reason: checked.reason };
}

/** The paper's text, as a rating run prepares it, from its PDF ({@link Target.bytes}). */
async function paperText(
  target: Target,
): Promise<{ ok: true; paper: PaperText } | { ok: false; failure: string }> {
  const bytes = await target.bytes();
  if (typeof bytes === "string") return { ok: false, failure: bytes };
  const text = await paperTextOf(bytes, RATING_SETTINGS.maxTextChars);
  if (text.ok) return text;
  return { ok: false, failure: text.reason === "no-text" ? "the PDF has no text" : "unreadable" };
}

/**
 * The paper's PDF, downloaded once into the cache, or why not. A file that is not a PDF, such as
 * the page a publisher shows a robot, is never cached: save the PDF there by hand.
 */
async function pdfBytes(paper: ReferencePaper): Promise<Uint8Array | string> {
  const path = new URL(`${paper.id}.pdf`, CACHE);
  const cached = await readFile(path).then(
    (file) => new Uint8Array(file),
    () => undefined,
  );
  const bytes = cached ?? (await download(paper.url));
  if (typeof bytes === "string") return bytes;
  if (!isPdf(bytes)) return `not a PDF (a robot check?): save the PDF as ${path.pathname}`;
  // unpdf takes the bytes over, so they are written to the cache before anything reads them.
  if (!cached) await writeFile(path, bytes);
  return bytes;
}

/** A PDF on disk, read again for each run since unpdf takes the bytes over, or why not. */
async function pdfOnDisk(path: string): Promise<Uint8Array | string> {
  const bytes = await readFile(path).then(
    (file) => new Uint8Array(file),
    () => undefined,
  );
  if (!bytes) return `no file at ${path}`;
  return isPdf(bytes) ? bytes : `not a PDF: ${path}`;
}

/** The file at `url`, or why it did not come. */
async function download(url: string): Promise<Uint8Array | string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) return `download failed (HTTP ${response.status})`;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return "download failed (no answer)";
  }
}

function isPdf(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

/** Calls Gemini, retrying a rate limit or an outage, and an answer the check refuses once. */
async function withRetries<T extends { ok: true } | GeminiFailureResult>(call: () => Promise<T>) {
  let unusable = 0;
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    const result = await call();
    if (result.ok || result.reason === "refused" || attempt === TRIES) return result;
    if (result.reason === "invalid-output") unusable += 1;
    if (unusable === RATING_SETTINGS.unusableAnswers) return result;
    console.error(`  Gemini: ${result.reason}, trying again in ${RETRY_WAIT_MS / 1000} s`);
    await sleep(RETRY_WAIT_MS);
  }
}

function failureOf(failure: GeminiFailureResult): string {
  return failure.status === undefined
    ? failure.reason
    : `${failure.reason} (HTTP ${failure.status})`;
}

/**
 * One paper's line, then, for a reference paper, each check scored otherwise than expected or
 * that lost Gemini's answer, with why. Checks are compared only when the study type is the
 * expected one.
 */
function report(target: Target, result: Found): void {
  const type =
    result.expected === undefined || result.found === result.expected
      ? (result.found ?? "?")
      : `${result.expected} → ${result.found ?? "?"}`;
  const range = result.range
    ? `expected ${result.range[0]}–${result.range[1]} · `
    : result.expected === "outside"
      ? "expected outside · "
      : "";
  const score = result.output?.score ?? "-";
  const took = result.seconds === undefined ? "" : ` · ${result.seconds} s`;
  console.log(
    `\n${target.id}\n  type ${type} · ${range}score ${score} · ${verdict(result)}${took}`,
  );
  const expectedChecks = target.reference?.expectedChecks;
  if (!result.output) return;
  if (!expectedChecks) {
    for (const check of result.output.checks) {
      if (check.claimed) console.log(`  ${check.id}: scored ${check.answer}${note(check)}`);
    }
    return;
  }
  if (result.found !== result.expected) {
    console.log("  checks not compared: another study type");
    return;
  }
  for (const check of result.output.checks) {
    const expected = expectedChecks[check.id] ?? "?";
    if (expected === check.answer && !check.claimed) continue;
    console.log(`  ${check.id}: expected ${expected}, scored ${check.answer}${note(check)}`);
  }
}

/** The quote behind a check's answer, or why Gemini's answer did not count. */
function note(check: CheckResult): string {
  const { claimed } = check;
  if (!claimed) return check.quote ? ` ("${clip(check.quote)}")` : "";
  if (claimed.answer === "not-applicable")
    return " (Gemini said not-applicable; it always applies)";
  return claimed.quote
    ? ` (Gemini said ${claimed.answer}; quote not in the paper: "${clip(claimed.quote)}")`
    : ` (Gemini said ${claimed.answer}, with no quote)`;
}

function verdict(result: Found): string {
  if (result.failure) return `FAILED: ${result.failure}`;
  if (result.expected === undefined) {
    return result.found === "outside" ? "classed outside" : "no expectations";
  }
  if (result.expected === "outside") {
    return result.found === "outside" ? "right" : "WRONG: scored in the field";
  }
  if (result.found === "outside") return "WRONG: classed outside";
  return inRange(result) ? "in range" : "OUT OF RANGE";
}

/** A paper's {@link Stability}, line by line. */
function describe(stability: Stability): string[] {
  const counts = (values: Readonly<Record<string, number | undefined>>) =>
    Object.entries(values)
      .map(([value, times]) => `${value} ×${times}`)
      .join(", ");
  const lines = [
    `scored ${stability.scores.length} · outside ${stability.outside} · failed ${stability.failed}`,
  ];
  if (!stability.fieldSteady) lines.push("field NOT steady: some runs classed it outside");
  if (!stability.enough) return [...lines, "not enough scored runs to compare"];
  lines.push(
    `study type ${counts(stability.studyTypes)}${stability.studyTypeSteady ? " (steady)" : ` (NOT steady; checks compared across the ${stability.studyType} runs)`}`,
    `scores ${stability.scores.join(", ")} · spread ${stability.spread}`,
  );
  for (const flip of stability.answerFlips) {
    lines.push(`answer flip ${flip.id}: ${counts(flip.counted)}`);
  }
  for (const flip of stability.quoteFlips) {
    lines.push(
      `quote flip ${flip.id}: counted ${counts(flip.counted)}, Gemini said ${counts(flip.said)}`,
    );
  }
  if (stability.answerFlips.length + stability.quoteFlips.length === 0) {
    lines.push("every check counted the same in every run");
  }
  return lines;
}

function clip(text: string): string {
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

function inRange(result: Found): boolean {
  const { range, output } = result;
  return Boolean(range && output && output.score >= range[0] && output.score <= range[1]);
}

/** The run's totals over the reference papers it scored; PDFs on disk have none. */
function summarize(found: readonly Found[]): void {
  const referenced = found.filter((result) => result.expected !== undefined);
  if (referenced.length === 0) return;
  const inField = referenced.filter((result) => result.expected !== "outside");
  const outside = referenced.filter((result) => result.expected === "outside");
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
