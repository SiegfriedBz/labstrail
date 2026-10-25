import { describe, expect, it } from "vitest";
import { answerLabel, checkRows, studyTypeLine } from "./checks.ts";

describe("checkRows", () => {
  it("words each check as a sentence about the paper, with its answer and quote", () => {
    expect(
      checkRows([
        { id: "funding", answer: "shown", quote: "Funded by the Wellcome Trust." },
        { id: "limitations", answer: "partly", quote: "One limit is the small sample." },
        { id: "code-availability", answer: "not-applicable" },
      ]),
    ).toEqual([
      {
        id: "funding",
        question: "The paper states who funded the work, or that it had no funding",
        answer: "shown",
        quote: "Funded by the Wellcome Trust.",
      },
      {
        id: "limitations",
        question: "The paper discusses the limitations of the study",
        answer: "partly",
        quote: "One limit is the small sample.",
      },
      {
        id: "code-availability",
        question:
          "The paper says where the analysis code or scripts can be found, or that no custom code was written",
        answer: "not-applicable",
      },
    ]);
  });

  it("keeps what the scorer claimed for a check that lost its point", () => {
    const [row] = checkRows([
      {
        id: "conflicts",
        answer: "missing",
        claimed: { answer: "shown", quote: "The authors declare no conflicts." },
      },
    ]);

    expect(row?.lost).toEqual({
      claimed: "shown",
      quote: "The authors declare no conflicts.",
      why: "The scorer quoted a passage that isn't in the paper's text, so the check counts as missing.",
    });
  });

  it("explains a lost point with no quote at all", () => {
    const [row] = checkRows([
      { id: "ethics", answer: "missing", claimed: { answer: "not-applicable" } },
    ]);

    expect(row?.lost?.why).toBe(
      "The scorer said this doesn't apply, but it always applies, so the check counts as missing.",
    );
  });
});

describe("answerLabel", () => {
  it.each([
    ["shown", "Shown"],
    ["partly", "Partly shown"],
    ["missing", "Missing"],
    ["not-applicable", "Doesn't apply"],
  ] as const)("labels %s", (answer, label) => {
    expect(answerLabel(answer)).toBe(label);
  });
});

describe("studyTypeLine", () => {
  it("names the kind of study and the checklist it was held to", () => {
    expect(studyTypeLine(["animal"])).toBe(
      "Read as an experiment on live vertebrates, such as mice, rats or zebrafish, or on cephalopods, against ARRIVE 2.0.",
    );
  });

  it("names every kind of study a paper reports, and each checklist", () => {
    expect(studyTypeLine(["animal", "lab"])).toBe(
      "Read as an experiment on live vertebrates, such as mice, rats or zebrafish, or on cephalopods, and a laboratory study of cells, tissues, molecules or microbes, or of invertebrates such as flies or worms, against ARRIVE 2.0 and MDAR.",
    );
  });

  it("names no checklist for a kind of study held to none", () => {
    expect(studyTypeLine(["other"])).toBe(
      "Read as any other kind, such as a case report, a qualitative study, a protocol or a diagnostic accuracy study.",
    );
  });

  it("says nothing for a rating with no study type", () => {
    expect(studyTypeLine(undefined)).toBeUndefined();
    expect(studyTypeLine([])).toBeUndefined();
  });

  it("names an animal or lab study as a rating before version 4 meant it", () => {
    expect(studyTypeLine(["animal"], "3")).toBe(
      "Read as an experiment on live animals, against ARRIVE 2.0.",
    );
    expect(studyTypeLine(["lab"], "2")).toBe(
      "Read as a laboratory study of cells, tissues, molecules or microbes, against MDAR.",
    );
    expect(studyTypeLine(["animal"], "")).toBe(
      "Read as an experiment on live vertebrates, such as mice, rats or zebrafish, or on cephalopods, against ARRIVE 2.0.",
    );
    expect(studyTypeLine(["animal"], "4")).toBe(
      "Read as an experiment on live vertebrates, such as mice, rats or zebrafish, or on cephalopods, against ARRIVE 2.0.",
    );
  });
});
