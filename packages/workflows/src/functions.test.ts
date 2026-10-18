import { afterEach, describe, expect, it, vi } from "vitest";
import { paperReaderOptions } from "./functions.ts";

describe("paperReaderOptions", () => {
  it("reads PDFs through the gateway and has GROBID take the environment's credential (ADR 0039)", () => {
    const options = paperReaderOptions({
      PINATA_GATEWAY_URL: "https://verisci.mypinata.cloud",
      GROBID_URL: "https://verisci-grobid.duckdns.org",
      DKG_TOKEN: "staging-credential",
    });

    expect(options).toMatchObject({
      gatewayUrl: "https://verisci.mypinata.cloud",
      grobidUrl: "https://verisci-grobid.duckdns.org",
      token: "staging-credential",
    });
  });
});

describe("alertMaintainer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs an alert on production when the Telegram settings are missing, never throwing", async () => {
    vi.resetModules();
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    vi.stubEnv("TELEGRAM_CHAT_ID", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { alertMaintainer } = await import("./functions.ts");

    await expect(alertMaintainer("verisci-publish-paper failed")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("verisci-publish-paper failed"));
  });
});
