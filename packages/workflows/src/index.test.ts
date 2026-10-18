import { afterEach, describe, expect, it, vi } from "vitest";
import { functions, servedFunctions } from "./index.ts";

describe("functions", () => {
  it("lists the functions this process's settings serve, read from process.env", () => {
    expect(functions.map((fn) => fn.id())).toEqual(
      servedFunctions(process.env).map((fn) => fn.id()),
    );
  });
});

describe("ratePaper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["staging", { limit: 3, period: "1h", burst: 3 }],
    ["production", { limit: 3, period: "1h", burst: 3 }],
    ["local", undefined],
  ])("on APP_ENV=%s is throttled to %o (ADR 0015)", async (appEnv, throttle) => {
    vi.stubEnv("APP_ENV", appEnv);
    vi.resetModules();
    const { ratePaper } = await import("./functions.ts");

    expect(ratePaper.opts.throttle).toEqual(throttle);
  });
});

describe("servedFunctions", () => {
  it("alerts on failures everywhere, and adds the rating, oracle, reconciler and health functions only where the oracle key is set (ADR 0019)", () => {
    expect(
      servedFunctions({ ORACLE_PRIVATE_KEY: `0x${"59c6".repeat(16)}` }).map((fn) => fn.id()),
    ).toEqual([
      "publish-paper",
      "alert-on-failure",
      "rate-paper",
      "oracle-transaction",
      "reconcile-ratings",
      "check-health",
    ]);
    expect(servedFunctions({}).map((fn) => fn.id())).toEqual(["publish-paper", "alert-on-failure"]);
  });
});

describe("alertMaintainer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("still alerts when the workflows' other settings are missing, from the Telegram settings alone", async () => {
    for (const name of ["GROBID_URL", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv("APP_ENV", "local");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { alertMaintainer } = await import("./functions.ts");

    await alertMaintainer("verisci-rate-paper failed (run 01JRUN): rating-failed:setup: x");

    expect(warn).toHaveBeenCalledWith(
      "notify: [local · alert] verisci-rate-paper failed (run 01JRUN): rating-failed:setup: x",
    );
  });
});
