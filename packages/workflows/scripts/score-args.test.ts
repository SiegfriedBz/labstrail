import { describe, expect, it } from "vitest";
import { budgetError, parseScoreArgs } from "./score-args.ts";

describe("parseScoreArgs", () => {
  it("reads reference paper ids, scored once each by default", () => {
    expect(parseScoreArgs(["rct-sprint-vs-hiit", "obs-nephrin-diabetic-nephropathy"])).toEqual({
      ok: true,
      args: {
        ids: ["rct-sprint-vs-hiit", "obs-nephrin-diabetic-nephropathy"],
        pdfs: [],
        repeat: 1,
        field: false,
      },
    });
  });

  it("scores each paper as many times as --repeat says", () => {
    expect(parseScoreArgs(["--repeat", "5", "rct-sprint-vs-hiit"])).toMatchObject({
      ok: true,
      args: { ids: ["rct-sprint-vs-hiit"], repeat: 5 },
    });
  });

  it.each([["1"], ["11"], ["x"], ["2.5"], [undefined]])("refuses --repeat %s", (value) => {
    const argv = value === undefined ? ["--repeat"] : ["--repeat", value];

    expect(parseScoreArgs(argv)).toEqual({
      ok: false,
      error: "--repeat takes a whole number from 2 to 10",
    });
  });

  it("reads PDFs on disk, each named after its file, any number of times", () => {
    expect(
      parseScoreArgs(["--pdf", "/tmp/papers/staging-polycomb.pdf", "--pdf", "other.PDF"]),
    ).toMatchObject({
      ok: true,
      args: {
        ids: [],
        pdfs: [
          { name: "staging-polycomb", path: "/tmp/papers/staging-polycomb.pdf" },
          { name: "other", path: "other.PDF" },
        ],
      },
    });
  });

  it("resolves a relative PDF path from the folder the command was typed in", () => {
    expect(
      parseScoreArgs(["--pdf", "papers/a.pdf", "--pdf", "/abs/b.pdf"], "/home/me/repo"),
    ).toMatchObject({
      ok: true,
      args: {
        pdfs: [
          { name: "a", path: "/home/me/repo/papers/a.pdf" },
          { name: "b", path: "/abs/b.pdf" },
        ],
      },
    });
  });

  it("refuses --pdf without a path", () => {
    expect(parseScoreArgs(["--pdf"])).toEqual({ ok: false, error: "--pdf takes a PDF's path" });
  });

  it.each([["low"], ["medium"], ["high"]] as const)("sends thinking level %s", (level) => {
    expect(parseScoreArgs(["--thinking", level])).toMatchObject({
      ok: true,
      args: { thinkingLevel: level },
    });
  });

  it("refuses any other thinking level, naming the three allowed", () => {
    expect(parseScoreArgs(["--thinking", "minimal"])).toEqual({
      ok: false,
      error: "--thinking takes low, medium or high",
    });
  });

  it("runs the field check on its own", () => {
    expect(parseScoreArgs(["--field", "rct-sprint-vs-hiit"])).toEqual({
      ok: true,
      args: { ids: ["rct-sprint-vs-hiit"], pdfs: [], repeat: 1, field: true },
    });
  });

  it.each([
    [["--field", "--repeat", "3"]],
    [["--field", "--thinking", "high"]],
    [["--field", "--pdf", "a.pdf"]],
  ])("refuses --field with scorer options: %j", (argv) => {
    expect(parseScoreArgs(argv)).toEqual({
      ok: false,
      error:
        "--field runs the field check alone, on reference papers: leave out --repeat, --thinking and --pdf",
    });
  });

  it("refuses an unknown option", () => {
    expect(parseScoreArgs(["--repeats", "5"])).toEqual({
      ok: false,
      error: "Unknown option --repeats",
    });
  });
});

describe("budgetError", () => {
  it("allows up to the day's 20 scorer requests", () => {
    expect(budgetError(4, 5)).toBeUndefined();
    expect(budgetError(14, 1)).toBeUndefined();
  });

  it("refuses more, with the count and the daily limit", () => {
    expect(budgetError(3, 7)).toBe(
      "This run would make 21 scorer requests; the free tier allows 20 a day for every environment together",
    );
  });
});
