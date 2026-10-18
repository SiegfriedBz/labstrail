// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = new URL("./", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, app), "utf8");

describe("the pages' viewport heights", () => {
  it("sizes the home hero and the body with svh, which stays still while a phone scrolls", () => {
    expect(read("page.tsx")).toContain("min-h-[calc(100svh-6.5rem)]");
    expect(read("layout.tsx")).toContain("min-h-svh");
  });

  it("leaves no dvh in app/, which grows as the address bar hides and moves the page", () => {
    const sources = readdirSync(app, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.(tsx?|css)$/.test(file) && !file.endsWith(".test.ts"),
    );

    expect(sources.length).toBeGreaterThan(5);
    expect(sources.filter((file) => /\bdvh\b|\d+dvh/.test(read(file)))).toEqual([]);
  });
});
