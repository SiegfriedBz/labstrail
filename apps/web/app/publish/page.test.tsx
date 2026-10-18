import { describe, expect, it } from "vitest";
import { SITE } from "../../lib/site.ts";
import { metadata } from "./page.tsx";

describe("/publish", () => {
  it("has its own title and description, never the site's", () => {
    expect(metadata.title).toBe("Publish a paper");
    expect(metadata.description).toMatch(/PDF of a life-science or health paper/);
    expect(metadata.description).not.toBe(SITE.description);
  });
});
