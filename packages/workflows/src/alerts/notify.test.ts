import { describe, expect, it, vi } from "vitest";
import { createNotify, type NotifyOptions } from "./notify.ts";

const TOKEN = "123456:secret-bot-token";

function setup(overrides: Partial<NotifyOptions> = {}) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true }));
  const logger = { info: vi.fn(), warn: vi.fn() };
  const notify = createNotify({
    appEnv: "staging",
    botToken: TOKEN,
    chatId: "-1001234",
    fetch,
    timeoutMs: 10_000,
    logger,
    ...overrides,
  });
  return { notify, fetch, logger };
}

describe("createNotify", () => {
  it("posts one Telegram message, prefixed with the environment and the level", async () => {
    const { notify, fetch } = setup();

    await notify({ level: "alert", text: "oracle-no-funds: 0xabc cannot pay" });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234",
      text: "[staging · alert] oracle-no-funds: 0xabc cannot pay",
      disable_web_page_preview: true,
    });
  });

  it("names activity apart from alerts", async () => {
    const { notify, fetch } = setup({ appEnv: "production" });

    await notify({ level: "activity", text: "Published: RNAi therapies" });

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).text).toBe(
      "[production · activity] Published: RNAi therapies",
    );
  });

  it("only logs the message when Telegram isn't set up", async () => {
    const { notify, fetch, logger } = setup({ botToken: undefined, chatId: undefined });

    await notify({ level: "alert", text: "rating-orphan: …/14" });
    await notify({ level: "activity", text: "Published: RNAi therapies" });

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("notify: [staging · alert] rating-orphan: …/14");
    expect(logger.info).toHaveBeenCalledWith(
      "notify: [staging · activity] Published: RNAi therapies",
    );
  });

  it.each([
    ["an error status", async () => new Response("Unauthorized", { status: 401 }), "HTTP 401"],
    [
      "no answer",
      async () => {
        throw new Error("fetch failed");
      },
      "fetch failed",
    ],
  ])(
    "logs, never throws, when Telegram gives %s, and never logs the token",
    async (_, answer, detail) => {
      const { notify, logger } = setup({ fetch: vi.fn(answer) });

      await expect(notify({ level: "alert", text: "x" })).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(`notify-unavailable: telegram: ${detail}`);
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(TOKEN);
    },
  );

  it("replaces the token when the error names the URL it was sent to", async () => {
    const { notify, logger } = setup({
      fetch: vi.fn(async (url: string) => {
        throw new Error(`request to ${url} failed`);
      }),
    });

    await notify({ level: "alert", text: "x" });

    expect(logger.warn).toHaveBeenCalledWith(
      "notify-unavailable: telegram: request to https://api.telegram.org/bot<token>/sendMessage failed",
    );
  });
});
