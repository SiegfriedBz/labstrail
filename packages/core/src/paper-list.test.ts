import { describe, expect, it } from "vitest";
import { authorRows, countRows, pageRows } from "./fixtures/paper-list-rows.ts";
import {
  paperAuthorsQuery,
  paperCountQuery,
  paperListQuery,
  parsePaperAuthors,
  parsePaperCount,
  parsePaperListing,
} from "./paper-list.ts";
import type { QueryBinding } from "./paper-record.ts";

const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
/** The graph's agent, our node: in the graph id's spelling, and in a UAL's. */
const AGENT = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3";
const AGENT_LOWER = AGENT.toLowerCase();
/** Where the node keeps a minted asset's triples (`docs/domain.md` → DKG). */
const ASSET_GRAPHS = `did:dkg:context-graph:${GRAPH}/_verifiable_memory/`;
const FIRST = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const SECOND = "bafybeihhkeyxcad3cuj42gvhpsh67tiagkwfxbjgjsx7m3tidbkknkifcy";
/** The first CID in its CIDv0 spelling: the same file, not the canonical spelling. */
const V0 = "QmeuWS7yCDk5yJEY1JC3zsp1WQeArgyU1Q4shjP7njFBcn";

/** The WHERE block of a query: the patterns that pick its papers. */
function where(query: string | undefined): string {
  if (!query) throw new Error("no query");
  return query.slice(query.indexOf("WHERE {"), query.lastIndexOf("}") + 1);
}

describe("paperListQuery", () => {
  const query = paperListQuery(GRAPH, { limit: 20, offset: 40 }) ?? "";

  it("reads the graph's _meta for minted Target KAs only", () => {
    expect(query).toContain(`GRAPH <did:dkg:context-graph:${GRAPH}/_meta>`);
    expect(query).toContain('<http://dkg.io/ontology/memoryLayer> "VM"');
  });

  it("keeps only the Target KAs our node named and minted, the graph's agent", () => {
    expect(query).toContain(
      `FILTER(STRSTARTS(STR(?asset), "did:dkg:context-graph:${GRAPH}/assertion/${AGENT}/verisci-tka-"))`,
    );
    expect(query).toContain(`FILTER(STRBEFORE(STRAFTER(STR(?ka), "/"), "/") = "${AGENT_LOWER}")`);
  });

  it("takes each paper's fields from its own asset's graph, never another's", () => {
    expect(query).toMatch(/GRAPH \?g \{\s*\?paper a <http:\/\/schema\.org\/ScholarlyArticle>/);
    for (const field of ["submitter", "signature", "deadline"]) {
      expect(query).toContain(`<urn:verisci:${field}>`);
    }
    expect(query).toContain(`FILTER(STR(?g) = CONCAT("${ASSET_GRAPHS}", STRAFTER(STR(?ka), "/")))`);
  });

  it("counts each paper's authors in that graph", () => {
    expect(query).toContain("OPTIONAL { ?paper <http://schema.org/author> ?author . }");
    expect(query).toContain("(COUNT(DISTINCT ?author) AS ?authorCount)");
  });

  it("orders by the mint's date, newest first, then by paper, and reads one page", () => {
    expect(query).toContain("<http://dkg.io/ontology/publishedAt>");
    expect(query).toMatch(
      /GROUP BY \?paper\s+ORDER BY DESC\(\?publishedAt\) \?paper\s+LIMIT 20 OFFSET 40$/,
    );
  });

  it.each([
    ["a bare graph name", "verisci-staging", { limit: 20, offset: 0 }],
    ["a short address", "0xD701/verisci-staging", { limit: 20, offset: 0 }],
    ["a name that closes the IRI", `${GRAPH}>`, { limit: 20, offset: 0 }],
    ["a name with a space", `${GRAPH} x`, { limit: 20, offset: 0 }],
    ["a name with a quote", `${GRAPH}"`, { limit: 20, offset: 0 }],
    ["a limit of 0", GRAPH, { limit: 0, offset: 0 }],
    ["a fractional limit", GRAPH, { limit: 1.5, offset: 0 }],
    ["a negative offset", GRAPH, { limit: 20, offset: -1 }],
    ["an offset that is not a number", GRAPH, { limit: 20, offset: Number.NaN }],
    ["an unsafe limit", GRAPH, { limit: 2 ** 53, offset: 0 }],
  ])("gives no query for %s", (_, graph, page) => {
    expect(paperListQuery(graph, page)).toBeUndefined();
  });
});

describe("paperCountQuery", () => {
  it("counts the papers the page query picks, with the same patterns but the authors", () => {
    const count = paperCountQuery(GRAPH);
    expect(count).toMatch(/^SELECT \(COUNT\(DISTINCT \?paper\) AS \?total\)/);
    expect(count).not.toContain("?author");
    expect(where(count)).toBe(
      where(paperListQuery(GRAPH, { limit: 1, offset: 0 })).replace(/\n\s*OPTIONAL \{[^}]*\}/, ""),
    );
  });

  it("gives no query for a graph id that is not a full one", () => {
    expect(paperCountQuery("verisci-staging")).toBeUndefined();
  });
});

describe("paperAuthorsQuery", () => {
  const papers = [
    { cid: FIRST, ual: `did:dkg:base:84532/${AGENT_LOWER}/9` },
    { cid: SECOND, ual: `did:dkg:base:84532/${AGENT_LOWER}/8` },
  ] as const;

  it("asks for each paper's first authors by position, in its own asset's graph", () => {
    const query = paperAuthorsQuery(GRAPH, papers, 3) ?? "";
    expect(query).toContain(
      `VALUES (?paper ?g) { (<urn:verisci:paper:${FIRST}> <${ASSET_GRAPHS}${AGENT_LOWER}/9>) (<urn:verisci:paper:${SECOND}> <${ASSET_GRAPHS}${AGENT_LOWER}/8>) }`,
    );
    expect(query).toMatch(/GRAPH \?g \{\s*\?paper <http:\/\/schema\.org\/author> \?listed/);
    expect(query).toContain("<http://schema.org/position> ?authorPosition");
    expect(query).toContain("FILTER(?authorPosition <= 3)");
  });

  it("puts only canonical CIDs and UALs our node minted in the query", () => {
    const query =
      paperAuthorsQuery(
        GRAPH,
        [
          papers[0],
          { cid: V0, ual: papers[1].ual },
          { cid: `${SECOND}> } #`, ual: papers[1].ual },
          { cid: SECOND, ual: "did:dkg:base:84532/0xnope/8" },
          { cid: SECOND, ual: "did:dkg:base:84532/0x1111111111111111111111111111111111111111/8" },
        ],
        3,
      ) ?? "";
    expect(query).toContain(`<urn:verisci:paper:${FIRST}>`);
    expect(query).not.toContain(V0);
    expect(query).not.toContain(SECOND);
  });

  it.each([
    ["no papers", GRAPH, [], 3],
    ["no canonical CID", GRAPH, [{ cid: V0, ual: papers[0].ual }], 3],
    ["a graph id that is not a full one", "verisci-staging", papers, 3],
    ["no author asked for", GRAPH, papers, 0],
    ["a fractional count", GRAPH, papers, 2.5],
  ])("gives no query for %s", (_, graph, listed, first) => {
    expect(paperAuthorsQuery(graph, listed, first)).toBeUndefined();
  });
});

describe("parsePaperListing", () => {
  it("reads one listing per paper, in the node's order", () => {
    expect(parsePaperListing(pageRows)).toEqual([
      {
        cid: FIRST,
        ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9",
        publishedAt: "2026-10-10T15:14:13.222Z",
        title:
          "TEAD4 Regulates apical domain homeostasis and cell-positioning to maintain the trophectoderm lineage during mouse blastocyst development",
        submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        signature: pageRows[0].signature.slice(1, -1),
        deadline: 1_791_645_808n,
        authorCount: 10,
      },
      {
        cid: SECOND,
        ual: "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/8",
        publishedAt: "2026-10-10T14:30:29.135Z",
        title: pageRows[1].title.slice(1, -1),
        submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        signature: pageRows[1].signature.slice(1, -1),
        deadline: 1_791_643_203n,
        authorCount: 0,
      },
    ]);
  });

  it("normalizes the UAL", () => {
    const [row] = pageRows;
    const [listing] = parsePaperListing([
      { ...row, ual: "did:dkg:BASE:84532/0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/9" },
    ]);
    expect(listing?.ual).toBe("did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/9");
  });

  it("keeps a paper once when the node gives it twice", () => {
    const [row] = pageRows;
    expect(parsePaperListing([row, row])).toHaveLength(1);
  });

  it.each<[string, QueryBinding]>([
    ["a subject that is not a paper", { ...pageRows[0], paper: `urn:other:${FIRST}` }],
    ["a CID that is not canonical", { ...pageRows[0], paper: `urn:verisci:paper:${V0}` }],
    ["no UAL", { ...pageRows[0], ual: "" }],
    ["a UAL that does not parse", { ...pageRows[0], ual: "did:dkg:base:84532/0xnope/9" }],
    ["a date that does not parse", { ...pageRows[0], publishedAt: '"yesterday"' }],
    ["no title", { ...pageRows[0], title: '""' }],
    ["no submitter", { paper: pageRows[0].paper, ual: pageRows[0].ual }],
    ["a deadline that is not a number", { ...pageRows[0], deadline: '"soon"' }],
    ["an author count that is not a number", { ...pageRows[0], authorCount: '"some"' }],
  ])("leaves out a row with %s", (_, row) => {
    expect(parsePaperListing([row, pageRows[1]]).map((paper) => paper.cid)).toEqual([SECOND]);
  });
});

describe("parsePaperCount", () => {
  it("reads the total", () => {
    expect(parsePaperCount(countRows)).toBe(5);
  });

  it.each<[string, QueryBinding[]]>([
    ["no row", []],
    ["no total", [{}]],
    ["a total that is not a number", [{ total: '"many"' }]],
    ["a negative total", [{ total: '"-1"^^<http://www.w3.org/2001/XMLSchema#integer>' }]],
  ])("gives undefined for %s", (_, rows) => {
    expect(parsePaperCount(rows)).toBeUndefined();
  });
});

describe("parsePaperAuthors", () => {
  it("gives each paper's first authors in position order", () => {
    const authors = parsePaperAuthors([...authorRows].reverse());
    expect(authors.get(FIRST)).toEqual([
      "Alexander W Bruce",
      "Rebecca Collier",
      "Martina Bohuslavová",
    ]);
    expect(authors.has(SECOND)).toBe(false);
  });

  it("skips rows that name no paper, no author or no position", () => {
    const [row] = authorRows;
    const authors = parsePaperAuthors([
      row,
      { ...row, paper: "urn:other:x" },
      { ...row, authorName: "" },
      { paper: row.paper, authorName: '"No Position"' },
    ]);
    expect([...authors.keys()]).toEqual([FIRST]);
    expect(authors.get(FIRST)).toEqual(["Alexander W Bruce"]);
  });
});
