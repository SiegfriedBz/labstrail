import { describe, expect, it } from "vitest";
import { SITE } from "./site.ts";

describe("SITE", () => {
  it("names VeriSci and says its field, its phases and its records in the description", () => {
    expect(SITE.name).toBe("VeriSci");
    expect(SITE.description).toMatch(/life-science and health papers/);
    expect(SITE.description).not.toMatch(/[—–]/);
    expect(SITE.description).toMatch(/quality ratings/);
    expect(SITE.description).toMatch(/machine reproducibility score to transparent human review/);
    expect(SITE.description).toMatch(/each paper and rating recorded off-chain and on-chain/);
  });

  it("defines VeriSci as rating papers' quality, with each paper and rating on and off chain", () => {
    expect(SITE.definition).toMatch(/rates the quality of life-science papers/);
    expect(SITE.definition).toMatch(/each paper and each of its ratings off-chain .* and on-chain/);
  });

  it("defines VeriSci in one sentence under 60 words", () => {
    expect(SITE.definition).toMatch(/^VeriSci is /);
    expect(SITE.definition.split(/\s+/).length).toBeLessThan(60);
    expect(SITE.definition.match(/\.\s/g)).toBeNull();
    expect(SITE.definition).not.toMatch(/[—–]/);
  });

  it("names who builds it and where its code is", () => {
    expect(SITE.repo).toBe("https://github.com/SiegfriedBz/verisci");
    expect(SITE.maintainer).toEqual({
      name: "Siegfried Bozza",
      linkedIn: "https://www.linkedin.com/in/siegfriedbozza",
    });
  });
});
