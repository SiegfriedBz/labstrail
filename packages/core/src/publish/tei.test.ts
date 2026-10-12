import { describe, expect, it, vi } from "vitest";
import { attentionTei } from "../fixtures/attention-tei.ts";
import { parseTeiHeader } from "./tei.ts";

/** A minimal GROBID header; `analytic` and `profile` are spliced into it. */
function tei({ analytic = "", profile = "" }: { analytic?: string; profile?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title level="a" type="main">A Title</title></titleStmt>
      <sourceDesc><biblStruct><analytic>${analytic}</analytic></biblStruct></sourceDesc>
    </fileDesc>
    <profileDesc>${profile}</profileDesc>
  </teiHeader>
</TEI>`;
}

describe("parseTeiHeader", () => {
  it("reads the title, the authors in order and the abstract of a GROBID header", () => {
    const result = parseTeiHeader(attentionTei);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metadata.title).toBe("Attention Is All You Need");
    expect(result.metadata.authors).toEqual([
      "Ashish Vaswani",
      "Google Brain",
      "Noam Shazeer",
      "Niki Parmar",
      "Google Research",
      "Jakob Uszkoreit",
      "Llion Jones",
      "Aidan N Gomez",
      "Łukasz Kaiser",
      "Illia Polosukhin",
    ]);
    expect(result.metadata.abstract).toMatch(/^The dominant sequence transduction models/);
    expect(result.metadata.abstract).toMatch(/Work performed while at Google Brain\.$/);
    expect(result.metadata.doi).toBeUndefined();
  });

  it.each([
    ["10.1000/XYZ.123", "10.1000/xyz.123"],
    ["https://doi.org/10.1000/abc", "10.1000/abc"],
    ["doi:10.1000/abc", "10.1000/abc"],
    [" DOI:10.1000/ABC ", "10.1000/abc"],
  ])("reads the DOI %s as %s", (idno, doi) => {
    const result = parseTeiHeader(tei({ analytic: `<idno type="DOI">${idno}</idno>` }));

    expect(result).toMatchObject({ ok: true, metadata: { doi } });
  });

  it.each([
    ["an IRI-breaking character", "10.1000/x>"],
    ["a quote", '10.1000/x"y'],
    ["no 10. prefix", "11.1000/abc"],
    ["no suffix", "10.1000/"],
  ])("drops a DOI with %s", (_, idno) => {
    const result = parseTeiHeader(
      tei({
        analytic: `<idno type="DOI">${idno.replace(">", "&gt;").replace('"', "&quot;")}</idno>`,
      }),
    );

    expect(result.ok && result.metadata.doi).toBe(undefined);
  });

  it("collapses whitespace and line breaks inside a field and trims it", () => {
    const result = parseTeiHeader(
      tei({
        analytic: `<author><persName><forename>  Ada\n</forename>
          <surname> Lovelace </surname></persName></author>`,
        profile: "<abstract><p>  One\n\n  line. </p><p>Two\tlines.</p></abstract>",
      }),
    );

    expect(result).toEqual({
      ok: true,
      metadata: { title: "A Title", authors: ["Ada Lovelace"], abstract: "One line. Two lines." },
    });
  });

  describe("accents GROBID splits from the letters of authors' names", () => {
    const named = (...parts: [string, string][]) =>
      parseTeiHeader(
        tei({
          analytic: `<author><persName>${parts.map(([tag, part]) => `<${tag}>${part}</${tag}>`).join("")}</persName></author>`,
        }),
      );
    const authors = (...names: string[]) =>
      parseTeiHeader(
        tei({
          analytic: names
            .map((name) => `<author><persName><surname>${name}</surname></persName></author>`)
            .join(""),
        }),
      );

    it("joins a spacing acute after a dotless i, and drops the space before it", () => {
      expect(authors("Montserrat Rodr\u0131 \u00b4guez-Ayala")).toMatchObject({
        metadata: { authors: ["Montserrat Rodr\u00edguez-Ayala"] },
      });
    });

    it("joins an accent after a space to the letter before it", () => {
      expect(authors("Bele \u00b4n Moreno-Franco", "Je \u00b4re \u00b4mie")).toMatchObject({
        metadata: { authors: ["Bel\u00e9n Moreno-Franco", "J\u00e9r\u00e9mie"] },
      });
    });

    it("joins an accent right after a dotless i", () => {
      expect(authors("Rodr\u0131\u00b4guez")).toMatchObject({
        metadata: { authors: ["Rodr\u00edguez"] },
      });
    });

    it("gives an acute before a dotless i to the i", () => {
      expect(authors("Garc \u00b4\u0131a")).toMatchObject({
        metadata: { authors: ["Garc\u00eda"] },
      });
    });

    it.each([
      ["a diaeresis", "Mu \u00a8ller", "M\u00fcller"],
      ["a cedilla", "Franc \u00b8ois", "Fran\u00e7ois"],
      ["a caron", "Dvor \u02c7\u00e1k", "Dvo\u0159\u00e1k"],
      ["a breve before a Turkish dotless i", "Yag \u02d8\u0131z", "Ya\u011f\u0131z"],
    ])("joins %s", (_, split, whole) => {
      expect(authors(split)).toMatchObject({ metadata: { authors: [whole] } });
    });

    it("composes a letter and a combining accent into one letter", () => {
      const result = authors("Jose\u0301");

      expect(result).toMatchObject({ metadata: { authors: ["Jos\u00e9"] } });
      expect(result.ok && result.metadata.authors[0]).toHaveLength(4);
    });

    it("gives an accent that opens a lowercase surname to the end of the forename", () => {
      expect(named(["forename", "Jose"], ["surname", "\u00b4ramo \u00b4n Banegas"])).toMatchObject({
        metadata: { authors: ["Jos\u00e9 ram\u00f3n Banegas"] },
      });
    });

    it("joins an accent after a one-letter part inside the word it opens", () => {
      expect(
        named(["forename", "Maria"], ["forename", "A"], ["surname", "\u00b4lvarez"]),
      ).toMatchObject({ metadata: { authors: ["Maria \u00c1lvarez"] } });
    });

    it("keeps an accent that opens a capitalised surname where it is", () => {
      expect(named(["forename", "Juan"], ["surname", "\u00b4Alvarez"])).toMatchObject({
        metadata: { authors: ["Juan \u00b4Alvarez"] },
      });
    });

    it("keeps the space after an accent its letter before takes", () => {
      expect(authors("Rene \u00b4 Descartes")).toMatchObject({
        metadata: { authors: ["Ren\u00e9 Descartes"] },
      });
    });

    it.each([
      ["an apostrophe before a capital", "O\u00b4Brien"],
      ["an apostrophe before a lowercase letter", "N\u00b4diaye Sa\u00b4id Dell\u00b4acqua"],
      ["a letter before that takes no such accent", "Nguy\u00ea \u02dcn"],
      ["no letter before it", "Li 3\u00b4"],
      ["ASCII ^, ~ or a backtick", "A^b C~d E`f"],
    ])("keeps %s", (_, name) => {
      expect(authors(name)).toMatchObject({ metadata: { authors: [name] } });
    });

    it("leaves the title and the abstract as GROBID gives them", () => {
      const title = "Alzheimer\u00b4s disease and the 3\u00b4 UTR";
      const abstract = "The \u00b4normal\u00b4 group, in \u02dc30% of cases.";
      const result = parseTeiHeader(
        tei({ profile: `<abstract><p>${abstract}</p></abstract>` }).replace("A Title", title),
      );

      expect(result).toMatchObject({ metadata: { title, abstract } });
    });

    it("gives the same metadata for the same header", () => {
      const xml = tei({
        analytic: "<author><persName><surname>Bele \u00b4n</surname></persName></author>",
      });

      expect(parseTeiHeader(xml)).toEqual(parseTeiHeader(xml));
    });
  });

  it("is ok with no abstract and no authors", () => {
    expect(parseTeiHeader(tei({}))).toEqual({
      ok: true,
      metadata: { title: "A Title", authors: [] },
    });
  });

  it("skips an author with no name", () => {
    const result = parseTeiHeader(
      tei({
        analytic:
          "<author><email>a@b.c</email></author><author><persName><surname>Lee</surname></persName></author>",
      }),
    );

    expect(result).toMatchObject({ ok: true, metadata: { authors: ["Lee"] } });
  });

  it.each([
    ["missing", tei({}).replace(/<titleStmt>.*<\/titleStmt>/, "<titleStmt/>")],
    ["empty", tei({}).replace("A Title", "  \n ")],
  ])("refuses a header whose title is %s", (_, xml) => {
    expect(parseTeiHeader(xml)).toEqual({ ok: false, reason: "no-title" });
  });

  it.each([
    ["empty input", ""],
    ["plain text", "not xml at all"],
    ["broken XML", "<TEI><teiHeader>"],
    ["XML that is not TEI", "<html><head><title>A Title</title></head></html>"],
    ["TEI with no header", '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text/></TEI>'],
    ["TEI with an unknown entity", tei({}).replace("A Title", "A &bogus; Title")],
    ["TEI with content after the root", `${tei({})}<extra/>`],
  ])("refuses %s as not-tei", (_, xml) => {
    expect(parseTeiHeader(xml)).toEqual({ ok: false, reason: "not-tei" });
  });

  it("prints nothing when it refuses broken XML", () => {
    // core has no DOM or Node types, so console is reached through globalThis.
    const output = (globalThis as unknown as { console: Record<"error" | "warn", () => void> })
      .console;
    const error = vi.spyOn(output, "error").mockImplementation(() => {});
    const warn = vi.spyOn(output, "warn").mockImplementation(() => {});

    parseTeiHeader("<TEI><teiHeader>");
    parseTeiHeader(`${tei({})}<extra/>`);

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });
});
