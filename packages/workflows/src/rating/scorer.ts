import {
  CLASSIFIER_OUTPUT_SCHEMA,
  type Classification,
  classifierPrompt,
  judgeOutputSchema,
  judgePrompt,
  type PaperText,
  parseClassifierOutput,
  parseJudgeOutput,
  type ScorerOutput,
  type StudyType,
  scoreChecks,
} from "@verisci/core";
import { z } from "zod";

/** How the scorer reaches Gemini, for one call. */
export interface ScorerOptions {
  /** A Gemini API key. Secret. */
  readonly apiKey: string;
  /** The model id, such as `gemini-3.8-flash`. */
  readonly model: string;
  readonly fetch: typeof fetch;
  /** How long Gemini gets to answer. */
  readonly timeoutMs: number;
}

/**
 * Why a score did not come back: `rate-limited`, `unreachable` and `invalid-output` are worth
 * a retry; `refused` (any 4xx but 429: a bad key, a key without access, a model Gemini no
 * longer serves, a request it does not accept) is a setup error.
 */
export type ScoreFailure = "rate-limited" | "refused" | "unreachable" | "invalid-output";

/** A call that did not answer; a `refused` one carries Gemini's HTTP status. */
export type ScoreFailureResult = {
  readonly ok: false;
  readonly reason: ScoreFailure;
  readonly status?: number;
};

/** The result of {@link classifyPaper}. */
export type ClassifyResult =
  | { readonly ok: true; readonly output: Classification; readonly model: string }
  | ScoreFailureResult;

/** The result of {@link judgePaper}: the score as `scoreChecks` computed it. */
export type JudgeResult =
  | { readonly ok: true; readonly output: ScorerOutput; readonly model: string }
  | ScoreFailureResult;

const API = "https://generativelanguage.googleapis.com/v1beta/models";

const answer = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  modelVersion: z.string().optional(),
});

/**
 * Asks Gemini which field a paper is in and what kind of study it is (ADRs 0018, 0037): the
 * prompt from `classifierPrompt`, temperature 0, JSON output held to `CLASSIFIER_OUTPUT_SCHEMA`
 * and checked again with `parseClassifierOutput`. Returns the classification and the model
 * version Gemini reports. Never throws; a failure carries neither the key nor Gemini's text.
 */
export async function classifyPaper(
  paper: PaperText,
  options: ScorerOptions,
): Promise<ClassifyResult> {
  const answer = await generate(classifierPrompt(paper), CLASSIFIER_OUTPUT_SCHEMA, options);
  if (!answer.ok) return answer;
  const parsed = parseClassifierOutput(answer.text);
  return parsed.ok
    ? { ok: true, output: parsed.output, model: answer.model }
    : { ok: false, reason: "invalid-output" };
}

/**
 * Asks Gemini to answer each check of `type`'s checklist for a paper, with quotes (ADR 0018):
 * the prompt from `judgePrompt`, temperature 0, JSON output held to `judgeOutputSchema(type)`
 * and checked again with `parseJudgeOutput`; `scoreChecks` then checks the quotes and computes
 * the score, so nothing else reaches the chain. Returns the output and the model version
 * Gemini reports. Never throws; a failure carries neither the key nor Gemini's text.
 */
export async function judgePaper(
  paper: PaperText,
  type: StudyType,
  options: ScorerOptions,
): Promise<JudgeResult> {
  const answer = await generate(judgePrompt(paper, type), judgeOutputSchema(type), options);
  if (!answer.ok) return answer;
  const parsed = parseJudgeOutput(answer.text, type);
  return parsed.ok
    ? { ok: true, output: scoreChecks(paper, type, parsed.output), model: answer.model }
    : { ok: false, reason: "invalid-output" };
}

/** One `generateContent` call: the answer's text, leaving out thoughts, and the model version. */
async function generate(
  prompt: { readonly system: string; readonly user: string },
  schema: object,
  options: ScorerOptions,
): Promise<
  { readonly ok: true; readonly text: string; readonly model: string } | ScoreFailureResult
> {
  let response: Response;
  try {
    response = await options.fetch(`${API}/${options.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!response.ok) {
    await response.body?.cancel();
    const reason = failureOf(response.status);
    return reason === "refused"
      ? { ok: false, reason, status: response.status }
      : { ok: false, reason };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "invalid-output" };
  }
  const parsed = answer.safeParse(body);
  const [candidate] = (parsed.success && parsed.data.candidates) || [];
  if (!parsed.success || !candidate || candidate.finishReason !== "STOP") {
    return { ok: false, reason: "invalid-output" };
  }
  const text = (candidate.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("");
  return { ok: true, text, model: parsed.data.modelVersion ?? options.model };
}

/**
 * 429 is Gemini's rate limit and 5xx its outage. Any other status is a request it refuses: a
 * bad key (400), a key without access (401, 403), a model it no longer serves (404).
 */
function failureOf(status: number): ScoreFailure {
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unreachable";
  return "refused";
}
