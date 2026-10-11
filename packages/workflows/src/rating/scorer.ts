import {
  parseScorerOutput,
  SCORER_OUTPUT_SCHEMA,
  type ScorerOutput,
  scorerPrompt,
  type Triple,
} from "@verisci/core";
import { z } from "zod";

/** How the scorer reaches Gemini. */
export interface ScorerOptions {
  /** A Gemini API key. Secret. */
  readonly apiKey: string;
  /** The model id, such as `gemini-3.8-flash`. */
  readonly model: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs: number;
}

/**
 * Why a score did not come back: `rate-limited`, `unreachable` and `invalid-output` are worth
 * a retry; `refused` (any 4xx but 429: a bad key, a key without access, a model Gemini no
 * longer serves, a request it does not accept) is a setup error.
 */
export type ScoreFailure = "rate-limited" | "refused" | "unreachable" | "invalid-output";

/** The result of {@link scorePaper}; a `refused` failure carries Gemini's HTTP status. */
export type ScoreResult =
  | { readonly ok: true; readonly output: ScorerOutput; readonly model: string }
  | { readonly ok: false; readonly reason: ScoreFailure; readonly status?: number };

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
 * Scores a target's triples with Gemini (ADR 0018): the prompt from `scorerPrompt`,
 * temperature 0, and JSON output held to `SCORER_OUTPUT_SCHEMA`, then checked again with
 * `parseScorerOutput`, so nothing else reaches the chain. Returns the output and the model
 * version Gemini reports, which the R-KA records. Never throws; a failure carries neither the
 * key nor Gemini's text.
 */
export async function scorePaper(
  triples: readonly Triple[],
  options: ScorerOptions,
): Promise<ScoreResult> {
  const { system, user } = scorerPrompt(triples);
  let response: Response;
  try {
    response = await options.fetch(`${API}/${options.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseJsonSchema: SCORER_OUTPUT_SCHEMA,
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
  const output = parseScorerOutput(text);
  if (!output.ok) return { ok: false, reason: "invalid-output" };
  return { ok: true, output: output.output, model: parsed.data.modelVersion ?? options.model };
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
