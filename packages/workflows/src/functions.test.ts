import { describe, expect, it } from "vitest";
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
