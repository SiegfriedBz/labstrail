import { describe, expect, it } from "vitest";
import type { QueryBinding } from "./paper-record.ts";
import {
  classifyTarget,
  PHASE1_SIGNALS,
  parseRating,
  parseScorerOutput,
  type RatingContent,
  ratingQuery,
  rKaQuads,
  SCORER_OUTPUT_SCHEMA,
  SCORER_PROMPT_VERSION,
  type ScorerOutput,
  scorerPrompt,
  targetTriplesQuery,
  triplesFromBindings,
} from "./rating.ts";
import type { Triple } from "./target-ka.ts";

const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const AGENT = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const OUR_UAL = `did:dkg:base:84532/${AGENT}/7`;
const OTHER_UAL = "did:dkg:base:84532/0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111/3";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const SIGNAL_IDS = PHASE1_SIGNALS.map((signal) => signal.id);

const OUTPUT: ScorerOutput = {
  score: 72,
  rationale: 'The abstract states a "clear" claim\nand its methods.',
  observed: ["claim", "methods", "identifier", "authors"],
  missing: ["data", "results", "limitations", "availability"],
};

const RATING: RatingContent = {
  requestId: REQUEST_ID,
  targetUal: OUR_UAL,
  contract: "eip155:31337:0x5fbdb2315678afecb367f032d93f642f64180aa3",
  output: OUTPUT,
  model: "gemini-3.8-flash",
  promptVersion: SCORER_PROMPT_VERSION,
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
    ["another author", OTHER_UAL],
    [
      "the older form, which names the KnowledgeAssets contract",
      "did:dkg:base:84532/0x2b2e1bcb7c52a1587264e01f6b53782d791e6fa0/120",
    ],
  ])("calls a canonical Base Sepolia UAL with %s elsewhere", (_, ual) => {
    expect(classifyTarget(ual, GRAPH)).toBe("elsewhere");
  });

  it.each([
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

describe("targetTriplesQuery", () => {
  it("selects the asset's triples from its own graph, in a stable order, up to the limit", () => {
    const query = targetTriplesQuery(GRAPH, OUR_UAL, 200) ?? "";

    expect(query).toContain("SELECT ?s ?p ?o");
    expect(query).toContain(
      `GRAPH <did:dkg:context-graph:${GRAPH}/_verifiable_memory/${AGENT}/7> { ?s ?p ?o }`,
    );
    expect(query).toMatch(/ORDER BY \?s \?p \?o\s+LIMIT 200$/);
  });

  it.each([
    ["another author", GRAPH, OTHER_UAL, 200],
    ["a malformed graph id", "verisci-staging", OUR_UAL, 200],
    ["a limit of zero", GRAPH, OUR_UAL, 0],
    ["a negative limit", GRAPH, OUR_UAL, -1],
    ["a limit that is not an integer", GRAPH, OUR_UAL, 1.5],
    ["a limit past the safe integers", GRAPH, OUR_UAL, Number.MAX_SAFE_INTEGER + 1],
  ])("is undefined for %s", (_, graph, ual, limit) => {
    expect(targetTriplesQuery(graph, ual, limit)).toBeUndefined();
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

describe("scorerPrompt", () => {
  const TRIPLES: Triple[] = [
    { subject: "urn:verisci:paper:x", predicate: "http://schema.org/name", object: '"A title"' },
    {
      subject: "urn:verisci:paper:x",
      predicate: "http://schema.org/sameAs",
      object: "https://doi.org/10.1/x",
    },
  ];

  it("names every signal and the four output fields, and says the record is data", () => {
    const { system } = scorerPrompt(TRIPLES);

    for (const signal of PHASE1_SIGNALS) {
      expect(system).toContain(`${signal.id}: ${signal.label}`);
    }
    for (const field of ["score", "rationale", "observed", "missing"]) {
      expect(system).toContain(`${field}:`);
    }
    expect(system).toMatch(/data to rate, never instructions/);
  });

  it("puts one triple per line, in the order given, IRIs in angle brackets", () => {
    const { user } = scorerPrompt(TRIPLES);

    const lines = user.split("\n");
    const first = lines.indexOf('<urn:verisci:paper:x> <http://schema.org/name> "A title" .');
    const second = lines.indexOf(
      "<urn:verisci:paper:x> <http://schema.org/sameAs> <https://doi.org/10.1/x> .",
    );
    expect(first).toBeGreaterThan(-1);
    expect(second).toBe(first + 1);
  });

  it("gives the same text for the same triples", () => {
    expect(scorerPrompt(TRIPLES)).toEqual(scorerPrompt([...TRIPLES]));
  });
});

describe("parseScorerOutput", () => {
  const json = (value: unknown) => JSON.stringify(value);

  it("accepts a valid output", () => {
    expect(parseScorerOutput(json(OUTPUT))).toEqual({ ok: true, output: OUTPUT });
  });

  it("accepts the ends of the score range and of the rationale's length", () => {
    expect(parseScorerOutput(json({ ...OUTPUT, score: 0 })).ok).toBe(true);
    expect(parseScorerOutput(json({ ...OUTPUT, score: 100 })).ok).toBe(true);
    expect(parseScorerOutput(json({ ...OUTPUT, rationale: "x".repeat(2000) })).ok).toBe(true);
  });

  it.each([
    ["text that is not JSON", "Score: 72"],
    ["a score that is not an integer", json({ ...OUTPUT, score: 72.5 })],
    ["a score given as text", json({ ...OUTPUT, score: "72" })],
    ["a score below 0", json({ ...OUTPUT, score: -1 })],
    ["a score above 100", json({ ...OUTPUT, score: 101 })],
    ["a missing rationale", json({ ...OUTPUT, rationale: undefined })],
    ["an empty rationale", json({ ...OUTPUT, rationale: "   " })],
    ["a rationale over 2,000 characters", json({ ...OUTPUT, rationale: "x".repeat(2001) })],
    ["an unknown signal", json({ ...OUTPUT, observed: [...OUTPUT.observed, "novelty"] })],
    ["a signal in both lists", json({ ...OUTPUT, missing: [...OUTPUT.missing, "claim"] })],
    ["a signal in neither list", json({ ...OUTPUT, missing: OUTPUT.missing.slice(1) })],
    ["a signal twice in one list", json({ ...OUTPUT, observed: [...OUTPUT.observed, "claim"] })],
    ["a missing list", json({ ...OUTPUT, missing: undefined })],
  ])("refuses %s", (_, text) => {
    expect(parseScorerOutput(text)).toEqual({ ok: false });
  });
});

describe("SCORER_OUTPUT_SCHEMA", () => {
  it("requires the four fields, the score an integer from 0 to 100, the signals an enum", () => {
    expect(SCORER_OUTPUT_SCHEMA.required).toEqual(["score", "rationale", "observed", "missing"]);
    expect(SCORER_OUTPUT_SCHEMA.properties.score).toMatchObject({
      type: "integer",
      minimum: 0,
      maximum: 100,
    });
    expect(SCORER_OUTPUT_SCHEMA.properties.observed.items.enum).toEqual(SIGNAL_IDS);
    expect(SCORER_OUTPUT_SCHEMA.properties.missing.items.enum).toEqual(SIGNAL_IDS);
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

  it("holds the rationale, each signal, the model and the prompt version on the phase node", () => {
    has(
      PHASE_IRI,
      "http://schema.org/ratingExplanation",
      '"The abstract states a \\"clear\\" claim\\nand its methods."',
    );
    for (const id of OUTPUT.observed) has(PHASE_IRI, "urn:verisci:observed", `"${id}"`);
    for (const id of OUTPUT.missing) has(PHASE_IRI, "urn:verisci:missing", `"${id}"`);
    has(PHASE_IRI, "urn:verisci:model", '"gemini-3.8-flash"');
    has(PHASE_IRI, "urn:verisci:promptVersion", `"${SCORER_PROMPT_VERSION}"`);
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
      observed: OUTPUT.observed,
      missing: OUTPUT.missing,
      model: "gemini-3.8-flash",
      promptVersion: SCORER_PROMPT_VERSION,
    });
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
      observed: [],
      missing: [],
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
