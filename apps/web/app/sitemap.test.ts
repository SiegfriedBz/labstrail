import { describe, expect, it } from "vitest";
import * as route from "./sitemap.ts";

describe("/sitemap.xml", () => {
  it("renders on request, so a build reads no settings and asks no node (ADR 0004)", () => {
    expect(route.dynamic).toBe("force-dynamic");
    expect(route).not.toHaveProperty("revalidate");
  });
});
