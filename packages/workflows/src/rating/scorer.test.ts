import {
  CLASSIFIER_OUTPUT_SCHEMA,
  checklistOf,
  classifierPrompt,
  judgeOutputSchema,
  judgePrompt,
  type PaperText,
} from "@verisci/core";
import { describe, expect, it, vi } from "vitest";
import { classifyPaper, judgePaper } from "./scorer.ts";

const KEY = "secret-gemini-key";
const PAPER: PaperText = {
  text: "A trial of citicoline after stroke.\nFunding: none.\nPatients were randomly assigned.",
  shortened: false,
};
const CLASSIFICATION = {
  field: "life-sciences",
  studyType: "other",
  reason: "A clinical trial of a drug after stroke.",
};
const JUDGED = {
  rationale: "It states its funding and little else.",
  checks: checklistOf("other").map(({ id }) => ({
    id,
    answer: id === "funding" ? "shown" : "missing",
    quote: id === "funding" ? "Funding: none." : "",
  })),
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

function gemini(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  const options = { apiKey: KEY, model: "gemini-3.8-flash", fetch, timeoutMs: 60_000 };
  return {
    fetch,
    classify: () => classifyPaper(PAPER, options),
    judge: () => judgePaper(PAPER, "other", options),
  };
}

function sentBody(fetch: ReturnType<typeof vi.fn>): unknown {
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe("classifyPaper", () => {
  it("asks Gemini once, with the classifier prompt, temperature 0 and its schema", async () => {
    const { fetch, classify } = gemini(async () =>
      answer(geminiAnswer(JSON.stringify(CLASSIFICATION))),
    );

    await classify();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(KEY);
    const { system, user } = classifierPrompt(PAPER);
    expect(sentBody(fetch)).toEqual({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: CLASSIFIER_OUTPUT_SCHEMA,
      },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the checked classification and the model version Gemini reports", async () => {
    const { classify } = gemini(async () => answer(geminiAnswer(JSON.stringify(CLASSIFICATION))));

    expect(await classify()).toEqual({
      ok: true,
      output: CLASSIFICATION,
      model: "gemini-3.8-flash-001",
    });
  });

  it("refuses a classification the check refuses", async () => {
    const { classify } = gemini(async () =>
      answer(geminiAnswer(JSON.stringify({ ...CLASSIFICATION, studyType: "poem" }))),
    );

    expect(await classify()).toEqual({ ok: false, reason: "invalid-output" });
  });
});

describe("judgePaper", () => {
  it("asks Gemini once, with the study type's judge prompt and schema", async () => {
    const { fetch, judge } = gemini(async () => answer(geminiAnswer(JSON.stringify(JUDGED))));

    await judge();

    const { system, user } = judgePrompt(PAPER, "other");
    expect(sentBody(fetch)).toEqual({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: judgeOutputSchema("other"),
      },
    });
  });

  it("returns the score code computed from the answers, and the model version", async () => {
    const { judge } = gemini(async () => answer(geminiAnswer(JSON.stringify(JUDGED))));
    const result = await judge();

    // `other`: 8 checks, all required or answered; funding shown: 1 / 8.
    expect(result).toMatchObject({
      ok: true,
      model: "gemini-3.8-flash-001",
      output: { score: 13, studyType: "other", rationale: JUDGED.rationale },
    });
    expect(result.ok && result.output.checks.find((check) => check.id === "funding")).toEqual({
      id: "funding",
      answer: "shown",
      quote: "Funding: none.",
    });
  });

  it("refuses an answer the check refuses", async () => {
    const { judge } = gemini(async () =>
      answer(geminiAnswer(JSON.stringify({ ...JUDGED, checks: JUDGED.checks.slice(1) }))),
    );

    expect(await judge()).toEqual({ ok: false, reason: "invalid-output" });
  });
});

describe("classifyPaper and judgePaper: Gemini's answers", () => {
  const calls = [
    ["classifyPaper", (g: ReturnType<typeof gemini>) => g.classify()],
    ["judgePaper", (g: ReturnType<typeof gemini>) => g.judge()],
  ] as const;

  it.each(calls)("%s names the model asked for when Gemini reports none", async (_, call) => {
    const text = JSON.stringify(_ === "classifyPaper" ? CLASSIFICATION : JUDGED);
    const g = gemini(async () => answer({ ...geminiAnswer(text), modelVersion: undefined }));

    expect(await call(g)).toMatchObject({ ok: true, model: "gemini-3.8-flash" });
  });

  it("reads the answer's text across its parts, leaving out thoughts", async () => {
    const text = JSON.stringify(CLASSIFICATION);
    const { classify } = gemini(async () =>
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

    expect(await classify()).toMatchObject({ ok: true, output: CLASSIFICATION });
  });

  it.each([
    ["429", async () => answer({ error: { code: 429 } }, 429), "rate-limited"],
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
      "a body that is not JSON",
      async () => new Response("<html>", { status: 200 }),
      "invalid-output",
    ],
  ])("gives %s as %s, for both calls", async (_, reply, reason) => {
    for (const [, call] of calls) {
      expect(await call(gemini(reply))).toEqual({ ok: false, reason });
    }
  });

  it.each([
    ["400, Gemini's answer to a bad key", 400],
    ["401", 401],
    ["403", 403],
    ["404, a model Gemini no longer serves", 404],
    ["413", 413],
  ])("answers refused with the status for %s", async (_, status) => {
    for (const [, call] of calls) {
      expect(await call(gemini(async () => answer({}, status)))).toEqual({
        ok: false,
        reason: "refused",
        status,
      });
    }
  });

  it("never carries the key in a result", async () => {
    for (const reply of [
      async () => answer({ error: { message: `bad key ${KEY}` } }, 400),
      () => Promise.reject(new Error(`failed with ${KEY}`)),
    ]) {
      for (const [, call] of calls) {
        expect(JSON.stringify(await call(gemini(reply)))).not.toContain(KEY);
      }
    }
  });
});
