// @vitest-environment node
import { EnvError, type RuntimeEnv } from "@verisci/env";
import { checkRatingSettings, createWorkflowsEnv } from "@verisci/workflows";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkServerSettings as check, register } from "./instrumentation.ts";
import { createWebEnv } from "./lib/web-env.ts";

const checkServerSettings = (runtimeEnv: RuntimeEnv) =>
  check(runtimeEnv, [createWorkflowsEnv, createWebEnv, checkRatingSettings]);

const settings = {
  DKG_URL: "http://127.0.0.1:9200",
  DKG_TOKEN: "secret-admin-token",
  DKG_CONTEXT_GRAPH: "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging",
  GROBID_URL: "http://127.0.0.1:8070",
  PINATA_GATEWAY_URL: "https://example.mypinata.cloud",
  CHAIN_RPC_URL: "https://sepolia.base.org",
  PINATA_JWT: "secret-pinata-jwt",
  INNGEST_EVENT_KEY: "secret-event-key",
  INNGEST_SIGNING_KEY: "signkey-test-0123",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "secret-upstash-token",
  REOWN_PROJECT_ID: "0123456789abcdef0123456789abcdef",
};

describe("checkServerSettings", () => {
  it("checks nothing locally, so pnpm dev runs with no settings", () => {
    expect(() => checkServerSettings({ APP_ENV: "local" })).not.toThrow();
  });

  it("refuses to start a deployed server with a missing setting, naming it", () => {
    const start = () =>
      checkServerSettings({ APP_ENV: "staging", ...settings, GROBID_URL: undefined });

    expect(start).toThrow(EnvError);
    expect(start).toThrow(/GROBID_URL/);
  });

  it("refuses to start a deployed server without the web app's settings", () => {
    const start = () =>
      checkServerSettings({ APP_ENV: "staging", ...settings, REOWN_PROJECT_ID: undefined });

    expect(start).toThrow(/REOWN_PROJECT_ID/);
  });

  it("refuses a -prod graph on staging at start (ADR 0005)", () => {
    expect(() =>
      checkServerSettings({
        APP_ENV: "staging",
        ...settings,
        DKG_CONTEXT_GRAPH: `${settings.DKG_CONTEXT_GRAPH.split("/")[0]}/verisci-prod`,
      }),
    ).toThrow(EnvError);
  });

  it("starts a deployed server whose settings are valid", () => {
    expect(() => checkServerSettings({ APP_ENV: "staging", ...settings })).not.toThrow();
  });
});

describe("checkRatingSettings", () => {
  const rating = { ORACLE_PRIVATE_KEY: `0x${"59c6".repeat(16)}`, GEMINI_API_KEY: "secret-gemini" };
  const production = {
    APP_ENV: "production",
    ...settings,
    DKG_CONTEXT_GRAPH: `${settings.DKG_CONTEXT_GRAPH.split("/")[0]}/verisci-prod`,
  };

  it("refuses to start production without the oracle key (ADR 0019)", () => {
    const start = () => checkServerSettings({ ...production, GEMINI_API_KEY: "secret-gemini" });

    expect(start).toThrow(EnvError);
    expect(start).toThrow(/ORACLE_PRIVATE_KEY/);
  });

  it("starts production with its rating settings", () => {
    expect(() => checkServerSettings({ ...production, ...rating })).not.toThrow();
  });

  it("checks staging's rating settings only when it holds the oracle key", () => {
    expect(() => checkServerSettings({ APP_ENV: "staging", ...settings })).not.toThrow();
    expect(() =>
      checkServerSettings({
        APP_ENV: "staging",
        ...settings,
        ORACLE_PRIVATE_KEY: rating.ORACLE_PRIVATE_KEY,
      }),
    ).toThrow(/GEMINI_API_KEY/);
  });
});

describe("register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("checks nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("GROBID_URL", "");

    await expect(register()).resolves.toBeUndefined();
  });

  it("checks the settings on the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("GROBID_URL", "");

    await expect(register()).rejects.toThrow(EnvError);
  });
});
