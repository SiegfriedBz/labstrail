import { describe, expect, it } from "vitest";
import { type PaperSubmission, targetKaQuads } from "../publish/target-ka.ts";
import { paperRecordQuery, parsePaperRecord, type QueryBinding, unquote } from "./paper-record.ts";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const SUBMISSION: PaperSubmission = {
  cid: CID,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: 1_791_639_162n,
};
const METADATA = {
  title: 'Screening "VP1" of deformed wing virus\nin bees',
  authors: ["Di Liu", "Yuting Xiao", "Dongliang Fei"],
  abstract: "Deformed wing virus (DWV) is a major viral pathogen.",
  doi: "10.3389/fmicb.2026.1860293",
};

/** The rows the node's SPARQL answer gives for the query, built from the triples we write. */
function bindingsFor(triples: ReturnType<typeof targetKaQuads>): QueryBinding[] {
  const paper = `urn:verisci:paper:${CID}`;
  return triples
    .filter((triple) => triple.subject === paper)
    .map((triple) => {
      const name = triples.find(
        (t) => t.subject === triple.object && t.predicate === "http://schema.org/name",
      );
      const position = triples.find(
        (t) => t.subject === triple.object && t.predicate === "http://schema.org/position",
      );
      return {
        p: triple.predicate,
        o: triple.object,
        ...(name && position ? { authorName: name.object, authorPosition: position.object } : {}),
      };
    });
}

describe("paperRecordQuery", () => {
  const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
  const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

  it("selects the paper's triples from its own asset's graph, with each author's name and position", () => {
    const query = paperRecordQuery(CID, GRAPH, UAL) ?? "";

    expect(query).toMatch(
      new RegExp(
        `GRAPH <did:dkg:context-graph:${GRAPH}/_verifiable_memory/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6> \\{\\s*<urn:verisci:paper:${CID}> \\?p \\?o`,
      ),
    );
    expect(query).toContain("?authorName");
    expect(query).toContain("?authorPosition");
  });

  it.each([
    ["a CID that is not canonical", "x> } DROP ALL { <y", GRAPH, UAL],
    ["a graph id that is not a full one", CID, "verisci-staging", UAL],
    ["a UAL that does not parse", CID, GRAPH, "did:dkg:base:84532/0xnope/6"],
    [
      "a UAL another agent minted",
      CID,
      GRAPH,
      "did:dkg:base:84532/0x1111111111111111111111111111111111111111/6",
    ],
  ])("refuses to build a query for %s", (_, cid, graph, ual) => {
    expect(paperRecordQuery(cid, graph, ual)).toBeUndefined();
  });
});

describe("parsePaperRecord", () => {
  it("reads back what the Target KA wrote, authors in their order", () => {
    const bindings = bindingsFor(targetKaQuads(METADATA, SUBMISSION)).reverse();

    expect(parsePaperRecord(CID, bindings)).toEqual({
      title: METADATA.title,
      authors: METADATA.authors,
      abstract: METADATA.abstract,
      doi: METADATA.doi,
      pdf: `ipfs://${CID}`,
      submitter: SUBMISSION.submitter,
      signature: SUBMISSION.signature,
      deadline: SUBMISSION.deadline,
    });
  });

  it("leaves out an abstract and a DOI the record does not have", () => {
    const record = parsePaperRecord(
      CID,
      bindingsFor(targetKaQuads({ title: "T", authors: [] }, SUBMISSION)),
    );

    expect(record?.abstract).toBeUndefined();
    expect(record?.doi).toBeUndefined();
    expect(record?.authors).toEqual([]);
  });

  it.each([
    ["no rows", []],
    ["no submitter", [{ p: "http://schema.org/name", o: '"T"' }]],
    [
      "a deadline that is not a number",
      bindingsFor(targetKaQuads({ title: "T", authors: [] }, SUBMISSION)).map((row) =>
        row.p === "urn:verisci:deadline" ? { ...row, o: '"soon"' } : row,
      ),
    ],
  ])("reads %s as no record", (_, bindings) => {
    expect(parsePaperRecord(CID, bindings)).toBeUndefined();
  });
});

describe("unquote", () => {
  it("decodes the escapes the DKG writes for control characters", () => {
    expect(unquote('"factor \\u000F which"')).toBe("factor \u000F which");
    expect(unquote('"a\\bb"')).toBe("a\bb");
    expect(unquote('"page\\fbreak"')).toBe("page\fbreak");
  });

  it("decodes a long escape, and keeps one past the last code point as written", () => {
    expect(unquote('"rat \\U0001F400 cell"')).toBe("rat \u{1F400} cell");
    expect(unquote('"bad \\U00110000 code"')).toBe("bad \\U00110000 code");
  });

  it("keeps decoding new lines, tabs, quotes and backslashes", () => {
    expect(unquote('"one\\ntwo\\rthree\\tfour"')).toBe("one\ntwo\rthree\tfour");
    expect(unquote('"say \\"hi\\" \\\\ done"')).toBe('say "hi" \\ done');
  });

  it("leaves a typed literal's value and a bare IRI as they are", () => {
    expect(unquote('"7"^^<http://www.w3.org/2001/XMLSchema#integer>')).toBe("7");
    expect(unquote("http://schema.org/Review")).toBe("http://schema.org/Review");
  });
});
