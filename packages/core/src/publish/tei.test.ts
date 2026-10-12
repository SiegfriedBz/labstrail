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
    const named = (forename: string, surname: string) =>
      parseTeiHeader(
        tei({
          analytic: `<author><persName><forename>${forename}</forename><surname>${surname}</surname></persName></author>`,
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
      expect(authors("Montserrat Rodrı ´guez-Ayala")).toMatchObject({
        metadata: { authors: ["Montserrat Rodríguez-Ayala"] },
      });
    });

    it("joins an accent to the letter before it, inside a word", () => {
      expect(authors("Bele ´n Moreno-Franco", "Je ´re ´mie")).toMatchObject({
        metadata: { authors: ["Belén Moreno-Franco", "Jérémie"] },
      });
    });

    it("joins an accent with no space before it", () => {
      expect(authors("Rodrı´guez")).toMatchObject({
        metadata: { authors: ["Rodríguez"] },
      });
    });

    it("gives an acute before a dotless i to the i", () => {
      expect(authors("Garc ´ıa")).toMatchObject({
        metadata: { authors: ["García"] },
      });
    });

    it.each([
      ["a diaeresis", "Mu¨ller", "Müller"],
      ["a cedilla", "Franc¸ois", "François"],
      ["a caron", "Dvorˇák", "Dvořák"],
      ["a breve before a Turkish dotless i", "Yag˘ız", "Yağız"],
    ])("joins %s", (_, split, whole) => {
      expect(authors(split)).toMatchObject({ metadata: { authors: [whole] } });
    });

    it("composes a letter and a combining accent into one letter", () => {
      const result = authors("José");

      expect(result).toMatchObject({ metadata: { authors: ["José"] } });
      expect(result.ok && result.metadata.authors[0]).toHaveLength(4);
    });

    it("gives an accent that opens a lowercase surname to the end of the forename", () => {
      expect(named("Jose", "´ramo ´n Banegas")).toMatchObject({
        metadata: { authors: ["José ramón Banegas"] },
      });
    });

    it("keeps an accent that opens a capitalised surname where it is", () => {
      expect(named("Juan", "´Alvarez")).toMatchObject({
        metadata: { authors: ["Juan ´Alvarez"] },
      });
    });

    it("keeps the space after an accent its letter before takes", () => {
      expect(authors("Rene ´ Descartes")).toMatchObject({
        metadata: { authors: ["René Descartes"] },
      });
    });

    it.each([
      ["an apostrophe before a capital", "O´Brien"],
      ["a letter before that takes no such accent", "Nguyê ˜n"],
      ["no letter before it", "Li 3´"],
    ])("keeps an accent with %s", (_, name) => {
      expect(authors(name)).toMatchObject({ metadata: { authors: [name] } });
    });

    it("leaves the title and the abstract as GROBID gives them", () => {
      const title = "Alzheimer´s disease and the 3´ UTR";
      const abstract = "The ´normal´ group, in ˜30% of cases.";
      const result = parseTeiHeader(
        tei({ profile: `<abstract><p>${abstract}</p></abstract>` }).replace("A Title", title),
      );

      expect(result).toMatchObject({ metadata: { title, abstract } });
    });

    it("gives the same metadata for the same header", () => {
      const xml = tei({
        analytic: "<author><persName><surname>Bele ´n</surname></persName></author>",
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
