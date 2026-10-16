import { Inngest } from "inngest";
import { describe, expect, it } from "vitest";
import { createFailureAlerts, failureText } from "./on-failure.ts";

const failed = (functionId: string, message: string) => ({
  function_id: functionId,
  run_id: "01JRUN",
  error: { name: "NonRetriableError", message },
  event: { name: "verisci/rating.requested", data: {} },
});

describe("failureText", () => {
  it("names the function, the run and the reason the error carries", () => {
    expect(
      failureText(
        failed(
          "verisci-rate-paper",
          "rating-failed:scorer-unavailable: verisci-rka-0xab gave up after 6 attempts: scorer unreachable (HTTP 503)",
        ),
      ),
    ).toBe(
      "verisci-rate-paper failed (run 01JRUN): rating-failed:scorer-unavailable: verisci-rka-0xab gave up after 6 attempts: scorer unreachable (HTTP 503)",
    );
  });

  it("keeps the error's first line, at most 300 characters", () => {
    const text = failureText(
      failed("verisci-publish-paper", `publish-failed:setup: ${"x".repeat(400)}\nstack`),
    );

    expect(text?.endsWith("…")).toBe(true);
    expect(text).not.toContain("stack");
    expect(text?.length).toBeLessThanOrEqual(
      "verisci-publish-paper failed (run 01JRUN): ".length + 301,
    );
  });

  it("is undefined for its own failures and for data that isn't a failure", () => {
    expect(failureText(failed("verisci-alert-on-failure", "x"))).toBeUndefined();
    expect(failureText({ nothing: true })).toBeUndefined();
  });
});

describe("createFailureAlerts", () => {
  it("runs on every function's failure", () => {
    const fn = createFailureAlerts(new Inngest({ id: "verisci-test" }), async () => {});

    expect(fn.opts.id).toBe("alert-on-failure");
    expect(fn.opts.triggers).toEqual([{ event: "inngest/function.failed" }]);
  });
});
