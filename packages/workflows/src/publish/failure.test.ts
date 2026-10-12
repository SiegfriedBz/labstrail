import { describe, expect, it } from "vitest";
import { describeFailure } from "./failure.ts";

describe("describeFailure", () => {
  it("names a refused connection by its cause", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8288"), {
      code: "ECONNREFUSED",
    });

    expect(describeFailure(new TypeError("fetch failed", { cause: refused }))).toBe(
      "fetch failed (connect ECONNREFUSED 127.0.0.1:8288)",
    );
  });

  it("keeps a timeout's message", () => {
    expect(describeFailure(new DOMException("The operation was aborted due to timeout"))).toBe(
      "The operation was aborted due to timeout",
    );
  });

  it("prefers a short message, on its first line", () => {
    const error = Object.assign(new Error("HTTP request failed.\n\nURL: https://rpc.example\n"), {
      shortMessage: "HTTP request failed.",
    });

    expect(describeFailure(error)).toBe("HTTP request failed.");
  });

  it.each([
    ["a URL", "Failed to send to https://inn.gs/e/some-event-key?x=1", "Failed to send to <url>"],
    ["a bearer token", "Unauthorized: Bearer abc.def-123", "Unauthorized: Bearer <redacted>"],
    ["a JWT", "bad token eyJhbGciOi.eyJzdWIiOiIx.c2ln", "bad token <redacted>"],
    ["a signature", "reverted for 0x1234567890abcdef1234567890abcdef", "reverted for <hex>"],
  ])("never carries %s", (_, message, described) => {
    expect(describeFailure(new Error(message))).toBe(described);
  });

  it("describes a thrown value that is not an error", () => {
    expect(describeFailure("no event id")).toBe("no event id");
    expect(describeFailure(undefined)).toBe("unknown error");
  });

  it("keeps it short", () => {
    expect(describeFailure(new Error("x".repeat(500)))).toHaveLength(200);
  });
});
