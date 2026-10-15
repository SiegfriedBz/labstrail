import { z } from "zod";

/** How a call reaches Gemini. */
export interface GeminiOptions {
  /** A Gemini API key. Secret. */
  readonly apiKey: string;
  /** The model id, such as `gemini-3.8-flash`. */
  readonly model: string;
  readonly fetch: typeof fetch;
  /** How long Gemini gets to answer. */
  readonly timeoutMs: number;
}

/**
 * Why a call did not answer: `rate-limited`, `unreachable` and `invalid-output` are worth a
 * retry; `refused` (any 4xx but 429: a bad key, a key without access, a model Gemini no longer
 * serves, a request it does not accept) is a setup error.
 */
export type GeminiFailure = "rate-limited" | "refused" | "unreachable" | "invalid-output";

/** A call that did not answer, with Gemini's HTTP status when it answered with an error. */
export type GeminiFailureResult = {
  readonly ok: false;
  readonly reason: GeminiFailure;
  readonly status?: number;
};

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
 * One `generateContent` call, shared by the scorer and the publish run's field check: the
 * prompt's system and user text, temperature 0, JSON output held to `schema`. Returns the
 * answer's text, leaving out thoughts, and the model version Gemini reports (the model asked
 * for when it reports none). An answer that did not finish with `STOP` is `invalid-output`.
 * Never throws; a failure carries neither the key nor Gemini's text.
 */
export async function generate(
  prompt: { readonly system: string; readonly user: string },
  schema: object,
  options: GeminiOptions,
): Promise<
  { readonly ok: true; readonly text: string; readonly model: string } | GeminiFailureResult
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
function failureOf(status: number): GeminiFailure {
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unreachable";
  return "refused";
}
