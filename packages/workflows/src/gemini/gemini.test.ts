import { describe, expect, it, vi } from "vitest";
import { type GeminiOptions, generate } from "./gemini.ts";

const PROMPT = { system: "Rate it.", user: "The paper." };
const SCHEMA = { type: "object" };

function gemini(extra: Partial<GeminiOptions> = {}) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{}" }] }, finishReason: "STOP" }],
        }),
      ),
  );
  const options: GeminiOptions = {
    apiKey: "secret-gemini-key",
    model: "gemini-3.8-flash",
    fetch,
    timeoutMs: 1_000,
    ...extra,
  };
  const config = async () => {
    await generate(PROMPT, SCHEMA, options);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    return JSON.parse(String(init.body)).generationConfig;
  };
  return { config };
}

describe("generate", () => {
  it("sends the thinking level it is given", async () => {
    const { config } = gemini({ thinkingLevel: "high" });

    expect(await config()).toMatchObject({ thinkingConfig: { thinkingLevel: "high" } });
  });

  it("sends no thinking settings when given no level, so Gemini uses its default", async () => {
    const { config } = gemini();

    expect(await config()).not.toHaveProperty("thinkingConfig");
  });
});
