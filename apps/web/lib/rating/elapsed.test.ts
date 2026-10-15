import { describe, expect, it } from "vitest";
import { requestedAgo, SLOW_AFTER_MS, takingLong } from "./elapsed.ts";

const AT = 1_791_900_000;
const at = (ms: number) => AT * 1000 + ms;

describe("requestedAgo", () => {
  it("says just now under a minute", () => {
    expect(requestedAgo(AT, at(59_000))).toBe("Requested just now");
  });

  it("counts minutes under an hour", () => {
    expect(requestedAgo(AT, at(25 * 60_000 + 30_000))).toBe("Requested 25 min ago");
  });

  it("counts hours and minutes past an hour", () => {
    expect(requestedAgo(AT, at(3 * 3_600_000 + 20 * 60_000))).toBe("Requested 3 h 20 min ago");
    expect(requestedAgo(AT, at(2 * 3_600_000))).toBe("Requested 2 h ago");
  });

  it("treats a clock behind the chain as just now", () => {
    expect(requestedAgo(AT, at(-5_000))).toBe("Requested just now");
  });
});

describe("takingLong", () => {
  it("is false up to the run's own retries, true past them", () => {
    expect(takingLong(AT, at(SLOW_AFTER_MS))).toBe(false);
    expect(takingLong(AT, at(SLOW_AFTER_MS + 1))).toBe(true);
  });
});
