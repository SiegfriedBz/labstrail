import { describe, expect, it } from "vitest";
import * as route from "./robots.ts";

describe("/robots.txt", () => {
  it("renders on request, so a build reads no settings (ADR 0004)", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});
