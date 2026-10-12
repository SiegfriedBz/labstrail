import {
  type PaperText,
  parseScorerAnswer,
  SCORER_OUTPUT_SCHEMA,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
  scorerPrompt,
} from "@verisci/core";
import { z } from "zod";

/** How the scorer reaches Gemini. */
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

/** A call that did not answer, with Gemini's HTTP status when it answered with an error. */
export type ScoreFailureResult = {
  readonly ok: false;
  readonly reason: ScoreFailure;
  readonly status?: number;
};

/** The result of {@link askScorer}: Gemini's answer, checked, its quotes not yet checked. */
export type AskResult =
  | { readonly ok: true; readonly answer: ScorerAnswer; readonly model: string }
  | ScoreFailureResult;

/**
 * The result of {@link scorePaper}: a paper in the field with its score, as `scoreChecks`
 * computed it, or a paper outside the field (ADR 0037) with the reason Gemini gave.
 */
export type ScoreResult =
  | {
      readonly ok: true;
      readonly field: "life-sciences";
      readonly output: ScorerOutput;
      readonly model: string;
    }
  | {
      readonly ok: true;
      readonly field: "outside";
      readonly reason: string;
      readonly model: string;
    }
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
 * Asks Gemini, in one request, for a paper's field and kind of study and, for a paper in the
 * field, the answer to each check of its study type, with quotes (ADRs 0018, 0037): the prompt
 * from `scorerPrompt`, temperature 0, JSON output held to `SCORER_OUTPUT_SCHEMA` and checked
 * again with `parseScorerAnswer`. Returns the answer, its quotes not yet checked against the
 * paper, and the model version Gemini reports. Never throws; a failure carries neither the key
 * nor Gemini's text.
 */
export async function askScorer(paper: PaperText, options: ScorerOptions): Promise<AskResult> {
  const answer = await generate(scorerPrompt(paper), SCORER_OUTPUT_SCHEMA, options);
  if (!answer.ok) return answer;
  const parsed = parseScorerAnswer(answer.text);
  return parsed.ok
    ? { ok: true, answer: parsed.answer, model: answer.model }
    : { ok: false, reason: "invalid-output" };
}

/**
 * Scores a paper with one Gemini request ({@link askScorer}): a paper outside the field comes
 * back with Gemini's reason; one in the field is scored by `scoreChecks`, which checks each
 * quote against the paper and computes the score, so nothing else reaches the chain.
 * Never throws.
 */
export async function scorePaper(paper: PaperText, options: ScorerOptions): Promise<ScoreResult> {
  const asked = await askScorer(paper, options);
  if (!asked.ok) return asked;
  const { answer, model } = asked;
  return answer.field === "outside"
    ? { ok: true, field: "outside", reason: answer.reason, model }
    : { ok: true, field: "life-sciences", output: scoreChecks(paper, answer), model };
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
    return { ok: false, reason: failureOf(response.status), status: response.status };
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
