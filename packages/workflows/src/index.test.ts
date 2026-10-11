import { describe, expect, it } from "vitest";
import { functions, servedFunctions } from "./index.ts";

describe("functions", () => {
  it("lists the publish function, built without reading any setting", () => {
    expect(functions.map((fn) => fn.id())).toEqual(["publish-paper"]);
  });
});

describe("servedFunctions", () => {
  it("adds the rating and oracle functions only where the oracle key is set (ADR 0019)", () => {
    expect(
      servedFunctions({ ORACLE_PRIVATE_KEY: `0x${"59c6".repeat(16)}` }).map((fn) => fn.id()),
    ).toEqual(["publish-paper", "rate-paper", "oracle-transaction"]);
    expect(servedFunctions({}).map((fn) => fn.id())).toEqual(["publish-paper"]);
  });
});
