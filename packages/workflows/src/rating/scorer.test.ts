import { SCORER_OUTPUT_SCHEMA, type ScorerOutput, scorerPrompt, type Triple } from "@verisci/core";
import { describe, expect, it, vi } from "vitest";
import { scorePaper } from "./scorer.ts";

const KEY = "secret-gemini-key";
const TRIPLES: Triple[] = [
  { subject: "urn:verisci:paper:x", predicate: "http://schema.org/name", object: '"A title"' },
];
const OUTPUT: ScorerOutput = {
  score: 64,
  rationale: "The record states a claim and names its authors.",
  observed: ["claim", "authors"],
  missing: ["methods", "data", "results", "limitations", "availability", "identifier"],
};

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geminiAnswer(text: string, extra: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
    modelVersion: "gemini-3.8-flash-001",
    ...extra,
  };
}

function scorer(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  const options = { apiKey: KEY, model: "gemini-3.8-flash", fetch, timeoutMs: 60_000 };
  return { fetch, score: () => scorePaper(TRIPLES, options) };
}

describe("scorePaper", () => {
  it("asks Gemini once, with the prompt, temperature 0 and the output schema", async () => {
    const { fetch, score } = scorer(async () => answer(geminiAnswer(JSON.stringify(OUTPUT))));

    await score();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    const { system, user } = scorerPrompt(TRIPLES);
    expect(JSON.parse(String(init.body))).toEqual({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: SCORER_OUTPUT_SCHEMA,
      },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the checked output and the model version Gemini reports", async () => {
    const { score } = scorer(async () => answer(geminiAnswer(JSON.stringify(OUTPUT))));

    expect(await score()).toEqual({ ok: true, output: OUTPUT, model: "gemini-3.8-flash-001" });
  });

  it("names the model asked for when Gemini reports none", async () => {
    const { score } = scorer(async () =>
      answer({ ...geminiAnswer(JSON.stringify(OUTPUT)), modelVersion: undefined }),
    );

    expect(await score()).toMatchObject({ ok: true, model: "gemini-3.8-flash" });
  });

  it("reads the answer's text across its parts, leaving out thoughts", async () => {
    const text = JSON.stringify(OUTPUT);
    const { score } = scorer(async () =>
      answer({
        candidates: [
          {
            content: {
              parts: [
                { text: "thinking…", thought: true },
                { text: text.slice(0, 20) },
                { text: text.slice(20) },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );

    expect(await score()).toMatchObject({ ok: true, output: OUTPUT });
  });

  it.each([
    ["429", async () => answer({ error: { code: 429 } }, 429), "rate-limited"],
    ["401", async () => answer({}, 401), "unauthorized"],
    ["403", async () => answer({}, 403), "unauthorized"],
    ["400, Gemini's answer to a bad key", async () => answer({}, 400), "unauthorized"],
    ["500", async () => answer({}, 500), "unreachable"],
    ["503", async () => answer({}, 503), "unreachable"],
    ["a network error", () => Promise.reject(new TypeError("fetch failed")), "unreachable"],
    [
      "a timeout",
      () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      "unreachable",
    ],
    [
      "no candidate",
      async () => answer({ promptFeedback: { blockReason: "SAFETY" } }),
      "invalid-output",
    ],
    [
      "an answer stopped for safety",
      async () =>
        answer({ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "SAFETY" }] }),
      "invalid-output",
    ],
    [
      "text the output check refuses",
      async () => answer(geminiAnswer(JSON.stringify({ ...OUTPUT, score: 101 }))),
      "invalid-output",
    ],
    [
      "a body that is not JSON",
      async () => new Response("<html>", { status: 200 }),
      "invalid-output",
    ],
  ])("gives %s as %s", async (_, reply, reason) => {
    const { score } = scorer(reply);

    expect(await score()).toEqual({ ok: false, reason });
  });

  it("never carries the key in a result", async () => {
    for (const reply of [
      async () => answer({ error: { message: `bad key ${KEY}` } }, 400),
      () => Promise.reject(new Error(`failed with ${KEY}`)),
    ]) {
      const { score } = scorer(reply);
      expect(JSON.stringify(await score())).not.toContain(KEY);
    }
  });
});
