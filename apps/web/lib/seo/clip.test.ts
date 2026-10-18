import { describe, expect, it } from "vitest";
import { clip } from "./clip.ts";

describe("clip", () => {
  it("keeps a text that fits, its whitespace collapsed", () => {
    expect(clip("  Screening VP1\n of deformed   wing virus ", 155)).toBe(
      "Screening VP1 of deformed wing virus",
    );
  });

  it("cuts a longer text at a word, with an ellipsis, within the limit", () => {
    const text = "Pseudouridine is the most abundant modification in RNA, and its sites in mRNA";

    const clipped = clip(text, 40);

    expect(clipped).toBe("Pseudouridine is the most abundant…");
    expect(clipped.length).toBeLessThanOrEqual(40);
  });

  it("drops a comma or a full stop left before the ellipsis", () => {
    expect(clip("One, two, three, four", 12)).toBe("One, two…");
  });

  it("cuts a single long word at the limit", () => {
    expect(clip("a".repeat(50), 10)).toBe(`${"a".repeat(9)}…`);
  });

  it("defaults to 155 characters, as search results show", () => {
    expect(clip("word ".repeat(60)).length).toBeLessThanOrEqual(155);
  });
});
