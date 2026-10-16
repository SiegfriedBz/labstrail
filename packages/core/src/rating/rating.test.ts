import { describe, expect, it } from "vitest";
import type { QueryBinding } from "../papers/paper-record.ts";
import type { Triple } from "../publish/target-ka.ts";
import {
  classifyTarget,
  paperHeadOf,
  paperPdfQuery,
  parseRating,
  pdfCidOf,
  type RatingContent,
  ratingQuery,
  rKaQuads,
  triplesFromBindings,
} from "./rating.ts";
import { SCORER_PROMPT_VERSION, type ScorerOutput } from "./scorer.ts";

const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const AGENT = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const OUR_UAL = `did:dkg:base:84532/${AGENT}/7`;
const OTHER_UAL = "did:dkg:base:84532/0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111/3";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

const OUTPUT: ScorerOutput = {
  score: 72,
  rationale: 'The paper states a "clear" claim\nand its methods.',
  studyType: "randomized-trial",
  checks: [
    { id: "sample-size", answer: "shown", quote: "We needed 60 patients for 80% power." },
    { id: "randomization", answer: "partly", quote: 'Patients were "randomly" assigned.' },
    {
      id: "harms",
      answer: "missing",
      claimed: { answer: "shown", quote: "No serious adverse events occurred." },
    },
    { id: "code-availability", answer: "not-applicable" },
  ],
};

const RATING: RatingContent = {
  requestId: REQUEST_ID,
  targetUal: OUR_UAL,
  contract: "eip155:31337:0x5fbdb2315678afecb367f032d93f642f64180aa3",
  output: OUTPUT,
  model: "gemini-3.8-flash",
  promptVersion: SCORER_PROMPT_VERSION,
  textShortened: false,
};

/** The node's rows for `SELECT ?s ?p ?o`, built from the triples we write. */
function rowsOf(triples: readonly Triple[]): QueryBinding[] {
  return triples.map((triple) => ({ s: triple.subject, p: triple.predicate, o: triple.object }));
}

describe("classifyTarget", () => {
  it("calls a canonical Base Sepolia UAL our node minted ours", () => {
    expect(classifyTarget(OUR_UAL, GRAPH)).toBe("ours");
  });

  it.each([
    ["another publisher's canonical UAL", OTHER_UAL],
    [
      "the older form, which names the KnowledgeAssets contract",
      "did:dkg:base:84532/0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0/120",
    ],
    ["a UAL that does not parse", "did:dkg:base:84532/0xnope/7"],
    ["an empty string", ""],
    ["an uppercase address", `did:dkg:base:84532/${AGENT.toUpperCase().replace("0X", "0x")}/7`],
    ["surrounding spaces", ` ${OUR_UAL} `],
    ["an uppercase prefix", OUR_UAL.replace("did:dkg:", "DID:DKG:")],
    ["another chain id", `did:dkg:base:8453/${AGENT}/7`],
    ["another blockchain", `did:dkg:otp:84532/${AGENT}/7`],
  ])("calls %s invalid", (_, ual) => {
    expect(classifyTarget(ual, GRAPH)).toBe("invalid");
  });
});

describe("paperPdfQuery and pdfCidOf", () => {
  it("reads the paper's schema:url, and its title and abstract when it has them, from its own graph", () => {
    const query = paperPdfQuery(GRAPH, OUR_UAL) ?? "";

    expect(query).toContain("SELECT ?url ?title ?abstract");
    expect(query).toContain(
      `GRAPH <did:dkg:context-graph:${GRAPH}/_verifiable_memory/${AGENT}/7> {\n    ?paper <http://schema.org/url> ?url .`,
    );
    expect(query).toContain("OPTIONAL { ?paper <http://schema.org/name> ?title }");
    expect(query).toContain("OPTIONAL { ?paper <http://schema.org/abstract> ?abstract }");
  });

  it("reads the paper's title and abstract from the same rows, unquoted", () => {
    expect(
      paperHeadOf([
        { url: `ipfs://${CID}`, title: '"RNAi \\"therapies\\""', abstract: '"Small RNAs."' },
      ]),
    ).toEqual({ title: 'RNAi "therapies"', abstract: "Small RNAs." });
    expect(paperHeadOf([{ url: `ipfs://${CID}` }])).toEqual({ title: "" });
    expect(paperHeadOf([])).toEqual({ title: "" });
  });

  it("is undefined for a paper another agent minted", () => {
    expect(paperPdfQuery(GRAPH, OTHER_UAL)).toBeUndefined();
  });

  it("finds the CID of the PDF the paper links", () => {
    expect(pdfCidOf([{ url: `ipfs://${CID}` }])).toBe(CID);
  });

  it.each([
    ["no rows", []],
    ["a row with no url", [{ paper: "urn:verisci:paper:x" }]],
    ["a link that is not ipfs://", [{ url: `https://gateway.example/ipfs/${CID}` }]],
    ["an invalid CID", [{ url: "ipfs://not-a-cid" }]],
    ["a literal", [{ url: `"ipfs://${CID}"` }]],
  ])("is undefined for %s", (_, rows: QueryBinding[]) => {
    expect(pdfCidOf(rows)).toBeUndefined();
  });
});

describe("triplesFromBindings", () => {
  it("turns ?s ?p ?o rows into triples, leaving out a row with a missing term", () => {
    const rows: QueryBinding[] = [
      { s: "urn:verisci:paper:x", p: "http://schema.org/name", o: '"A title"' },
      { s: "urn:verisci:paper:x", p: "http://schema.org/url" },
    ];

    expect(triplesFromBindings(rows)).toEqual([
      { subject: "urn:verisci:paper:x", predicate: "http://schema.org/name", object: '"A title"' },
    ]);
  });
});

describe("rKaQuads", () => {
  const RATING_IRI = `urn:verisci:rating:${REQUEST_ID}`;
  const PHASE_IRI = `${RATING_IRI}/phase/1`;
  const has = (subject: string, predicate: string, object: string) =>
    expect(rKaQuads(RATING)).toContainEqual({ subject, predicate, object });

  it("types the rating as a review about its target, with a phase-1 rating node", () => {
    has(RATING_IRI, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "http://schema.org/Review");
    has(RATING_IRI, "http://schema.org/about", OUR_UAL);
    has(RATING_IRI, "http://schema.org/reviewRating", PHASE_IRI);
    has(PHASE_IRI, "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", "http://schema.org/Rating");
  });

  it("gives the score, its range and its phase as integers", () => {
    const integer = (n: number) => `"${n}"^^<http://www.w3.org/2001/XMLSchema#integer>`;
    has(PHASE_IRI, "http://schema.org/ratingValue", integer(72));
    has(PHASE_IRI, "http://schema.org/worstRating", integer(0));
    has(PHASE_IRI, "http://schema.org/bestRating", integer(100));
    has(PHASE_IRI, "urn:verisci:phase", integer(1));
  });

  it("holds the rationale, the study type, the model and the prompt version on the phase node", () => {
    has(
      PHASE_IRI,
      "http://schema.org/ratingExplanation",
      '"The paper states a \\"clear\\" claim\\nand its methods."',
    );
    has(PHASE_IRI, "urn:verisci:studyType", '"randomized-trial"');
    has(
      PHASE_IRI,
      "urn:verisci:textShortened",
      '"false"^^<http://www.w3.org/2001/XMLSchema#boolean>',
    );
    has(PHASE_IRI, "urn:verisci:model", '"gemini-3.8-flash"');
    has(PHASE_IRI, "urn:verisci:promptVersion", '"3"');
  });

  it("links one node per check, with its id, its answer and its quote when it has one", () => {
    const check = (id: string) => `${PHASE_IRI}/check/${id}`;
    for (const { id, answer } of OUTPUT.checks) {
      has(PHASE_IRI, "urn:verisci:check", check(id));
      has(check(id), "urn:verisci:checkId", `"${id}"`);
      has(check(id), "urn:verisci:answer", `"${answer}"`);
    }
    has(check("sample-size"), "urn:verisci:quote", '"We needed 60 patients for 80% power."');
    has(check("randomization"), "urn:verisci:quote", '"Patients were \\"randomly\\" assigned."');
    const quoted = rKaQuads(RATING).filter((t) => t.predicate === "urn:verisci:quote");
    expect(quoted.map((t) => t.subject)).toEqual([check("sample-size"), check("randomization")]);
  });

  it("keeps what the model claimed for a check the score could not count", () => {
    const harms = `${PHASE_IRI}/check/harms`;

    has(harms, "urn:verisci:answer", '"missing"');
    has(harms, "urn:verisci:claimedAnswer", '"shown"');
    has(harms, "urn:verisci:claimedQuote", '"No serious adverse events occurred."');
    const claimed = rKaQuads(RATING).filter((t) => t.predicate === "urn:verisci:claimedAnswer");
    expect(claimed.map((t) => t.subject)).toEqual([harms]);
  });

  it("says when the paper's text was shortened to fit", () => {
    expect(rKaQuads({ ...RATING, textShortened: true })).toContainEqual({
      subject: PHASE_IRI,
      predicate: "urn:verisci:textShortened",
      object: '"true"^^<http://www.w3.org/2001/XMLSchema#boolean>',
    });
  });

  it("writes the checks in the order given", () => {
    const linked = rKaQuads(RATING)
      .filter((t) => t.predicate === "urn:verisci:check")
      .map((t) => t.object.split("/").at(-1));

    expect(linked).toEqual(["sample-size", "randomization", "harms", "code-availability"]);
  });

  it("records the request id and the contract on the rating", () => {
    has(RATING_IRI, "urn:verisci:requestId", `"${REQUEST_ID}"`);
    has(RATING_IRI, "urn:verisci:contract", `"${RATING.contract}"`);
  });

  it("escapes a backslash in a literal", () => {
    const quads = rKaQuads({ ...RATING, output: { ...OUTPUT, rationale: "a\\b\rc" } });

    expect(quads).toContainEqual({
      subject: PHASE_IRI,
      predicate: "http://schema.org/ratingExplanation",
      object: '"a\\\\b\\rc"',
    });
  });

  it("gives equal quads in the same order for the same input", () => {
    expect(rKaQuads(RATING)).toEqual(rKaQuads({ ...RATING }));
  });
});

describe("ratingQuery and parseRating", () => {
  const R_KA_UAL = `did:dkg:base:84532/${AGENT}/12`;

  it("reads the R-KA's triples from its own graph", () => {
    const query = ratingQuery(GRAPH, R_KA_UAL) ?? "";

    expect(query).toContain("SELECT ?s ?p ?o");
    expect(query).toContain(
      `GRAPH <did:dkg:context-graph:${GRAPH}/_verifiable_memory/${AGENT}/12> { ?s ?p ?o }`,
    );
  });

  it("is undefined for an R-KA another agent minted", () => {
    expect(ratingQuery(GRAPH, OTHER_UAL)).toBeUndefined();
  });

  it("reads back what rKaQuads wrote", () => {
    expect(parseRating(rowsOf(rKaQuads(RATING)))).toEqual({
      requestId: REQUEST_ID,
      targetUal: OUR_UAL,
      score: 72,
      rationale: OUTPUT.rationale,
      studyType: "randomized-trial",
      checks: OUTPUT.checks,
      model: "gemini-3.8-flash",
      promptVersion: SCORER_PROMPT_VERSION,
      textShortened: false,
    });
    expect(parseRating(rowsOf(rKaQuads({ ...RATING, textShortened: true })))?.textShortened).toBe(
      true,
    );
  });

  it("puts the checks in checklist order, whatever order the node returns them in", () => {
    const rows = rowsOf(rKaQuads(RATING)).reverse();

    expect(parseRating(rows)?.checks.map((check) => check.id)).toEqual([
      "sample-size",
      "randomization",
      "harms",
      "code-availability",
    ]);
  });

  it("leaves out a check with an unknown id, an unknown answer, or none of the study type's", () => {
    const phase = `urn:verisci:rating:${REQUEST_ID}/phase/1`;
    const extra = (id: string, answer: string): Triple[] => [
      { subject: phase, predicate: "urn:verisci:check", object: `${phase}/check/${id}` },
      { subject: `${phase}/check/${id}`, predicate: "urn:verisci:checkId", object: `"${id}"` },
      { subject: `${phase}/check/${id}`, predicate: "urn:verisci:answer", object: `"${answer}"` },
    ];
    const rows = rowsOf([
      ...rKaQuads(RATING),
      ...extra("novelty", "shown"),
      ...extra("blinding", "yes"),
      ...extra("replicates", "shown"),
    ]);

    expect(parseRating(rows)?.checks).toEqual(OUTPUT.checks);
  });

  it("leaves out a claimed answer that is not one of the answers", () => {
    const rows = rowsOf(rKaQuads(RATING)).map((row) =>
      row.p === "urn:verisci:claimedAnswer" ? { ...row, o: '"maybe"' } : row,
    );

    expect(parseRating(rows)?.checks.find((check) => check.id === "harms")).toEqual({
      id: "harms",
      answer: "missing",
    });
  });

  it("reads a v1 R-KA's score, with no study type and no checks", () => {
    const review = `urn:verisci:rating:${REQUEST_ID}`;
    const phase = `${review}/phase/1`;
    const v1: Triple[] = [
      {
        subject: review,
        predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        object: "http://schema.org/Review",
      },
      { subject: review, predicate: "http://schema.org/about", object: OUR_UAL },
      { subject: review, predicate: "http://schema.org/reviewRating", object: phase },
      {
        subject: phase,
        predicate: "http://schema.org/ratingValue",
        object: '"38"^^<http://www.w3.org/2001/XMLSchema#integer>',
      },
      { subject: phase, predicate: "urn:verisci:observed", object: '"claim"' },
      { subject: phase, predicate: "urn:verisci:missing", object: '"data"' },
      { subject: phase, predicate: "urn:verisci:promptVersion", object: '"1"' },
    ];

    expect(parseRating(rowsOf(v1))).toMatchObject({
      score: 38,
      checks: [],
      promptVersion: "1",
    });
    expect(parseRating(rowsOf(v1))?.studyType).toBeUndefined();
    expect(parseRating(rowsOf(v1))?.textShortened).toBeUndefined();
  });

  it("reads an unknown study type as none, with no checks", () => {
    const rows = rowsOf(rKaQuads(RATING)).map((row) =>
      row.p === "urn:verisci:studyType" ? { ...row, o: '"poem"' } : row,
    );

    expect(parseRating(rows)).toMatchObject({ score: 72, checks: [] });
    expect(parseRating(rows)?.studyType).toBeUndefined();
  });

  it.each([
    ["the score is missing", (t: Triple) => t.predicate !== "http://schema.org/ratingValue"],
    ["the target is missing", (t: Triple) => t.predicate !== "http://schema.org/about"],
  ])("is undefined when %s", (_, keep) => {
    expect(parseRating(rowsOf(rKaQuads(RATING).filter(keep)))).toBeUndefined();
  });

  it("reads fields an R-KA lacks, other than the target and score, as empty", () => {
    const keep = new Set([
      "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      "http://schema.org/about",
      "http://schema.org/ratingValue",
    ]);

    expect(parseRating(rowsOf(rKaQuads(RATING).filter((t) => keep.has(t.predicate))))).toEqual({
      requestId: "",
      targetUal: OUR_UAL,
      score: 72,
      rationale: "",
      checks: [],
      model: "",
      promptVersion: "",
    });
  });

  it("is undefined when the score is out of range", () => {
    const rows = rowsOf(rKaQuads(RATING)).map((row) =>
      row.p === "http://schema.org/ratingValue"
        ? { ...row, o: '"101"^^<http://www.w3.org/2001/XMLSchema#integer>' }
        : row,
    );

    expect(parseRating(rows)).toBeUndefined();
  });

  it("is undefined for no rows", () => {
    expect(parseRating([])).toBeUndefined();
  });
});
