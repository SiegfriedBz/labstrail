import { assetGraphIri, contextGraphIri } from "../assets/asset-graph.ts";
import { TARGET_KA_PREFIX } from "../assets/asset-names.ts";
import { canonicalCid } from "../assets/cid.ts";
import { normalizeUal } from "../assets/ual.ts";
import { VERISCI_NS } from "../publish/target-ka.ts";
import { type QueryBinding, unquote } from "./paper-record.ts";

/** A published paper as the list shows it, read from its Target KA and the node's `_meta`. */
export interface PaperListing {
  /** The PDF's canonical CID, which names the paper's page. */
  readonly cid: string;
  /** The Target KA's UAL, normalized (ADR 0031). */
  readonly ual: string;
  /** When the node minted it, as an ISO date-time. */
  readonly publishedAt: string;
  readonly title: string;
  /** The submitter's address, as the KA records it. */
  readonly submitter: string;
  readonly signature: string;
  /** The signed deadline, in Unix seconds. */
  readonly deadline: bigint;
  /** How many authors the KA lists. */
  readonly authorCount: number;
}

const SCHEMA = "http://schema.org/";
const DKG = "http://dkg.io/ontology/";
const PAPER = `${VERISCI_NS}paper:`;
const DIGITS = /^\d+$/;

/**
 * The patterns that pick the graph's published papers: each Target KA in the graph's `_meta`
 * that our node named and minted (the graph's agent, in the asset's path and in its UAL),
 * joined to the triples in that asset's own graph, so an asset another node adds to the
 * graph is never listed and never changes one of ours. `authors` also counts each paper's
 * authors. The node's layout and why `?g` is filtered rather than bound are in
 * `docs/domain.md` → DKG. With `ual` (canonical), only that asset is matched. `undefined` for
 * a graph id that is not a full one.
 */
function publishedPapers(contextGraph: string, authors = false, ual?: string): string | undefined {
  const graph = contextGraphIri(contextGraph);
  if (!graph) return undefined;
  const agent = contextGraph.slice(0, contextGraph.indexOf("/"));
  const authorPattern = authors ? `\n    OPTIONAL { ?paper <${SCHEMA}author> ?author . }` : "";
  const only = ual ? `\n  VALUES ?ka { <${ual}> }` : "";
  return `WHERE {${only}
  GRAPH <${graph}/_meta> {
    ?asset <${DKG}memoryLayer> "VM" ;
      <${DKG}kaUal> ?ka .
    ?ka <${DKG}publishedAt> ?minted .
  }
  FILTER(STRSTARTS(STR(?asset), "${graph}/assertion/${agent}/${TARGET_KA_PREFIX}"))
  FILTER(STRBEFORE(STRAFTER(STR(?ka), "/"), "/") = "${agent.toLowerCase()}")
  BIND(IRI(CONCAT("${PAPER}", STRAFTER(STR(?asset), "/${TARGET_KA_PREFIX}"))) AS ?paper)
  GRAPH ?g {
    ?paper a <${SCHEMA}ScholarlyArticle> ;
      <${SCHEMA}name> ?name ;
      <${VERISCI_NS}submitter> ?by ;
      <${VERISCI_NS}signature> ?signed ;
      <${VERISCI_NS}deadline> ?until .${authorPattern}
  }
  FILTER(STR(?g) = CONCAT("${graph}/_verifiable_memory/", STRAFTER(STR(?ka), "/")))
}`;
}

/**
 * The SPARQL query for one page of the graph's published papers, newest mint first: one row
 * per paper with its author count, read by {@link parsePaperListing}. `undefined` for a
 * graph id that is not a full one (or whose name holds one of `<>"{}|^` `` ` `` `\`), a
 * limit below 1, or a limit or offset that is negative or not a safe integer.
 */
export function paperListQuery(
  contextGraph: string,
  page: { readonly limit: number; readonly offset: number },
): string | undefined {
  const where = publishedPapers(contextGraph, true);
  if (!where || !wholeNumber(page.limit) || page.limit < 1 || !wholeNumber(page.offset)) {
    return undefined;
  }
  return `SELECT ?paper (SAMPLE(?ka) AS ?ual) (MAX(?minted) AS ?publishedAt) (SAMPLE(?name) AS ?title) (SAMPLE(?by) AS ?submitter) (SAMPLE(?signed) AS ?signature) (SAMPLE(?until) AS ?deadline) (COUNT(DISTINCT ?author) AS ?authorCount)
${where}
GROUP BY ?paper
ORDER BY DESC(?publishedAt) ?paper
LIMIT ${page.limit} OFFSET ${page.offset}`;
}

/**
 * The SPARQL query counting the papers {@link paperListQuery} pages through, with the same
 * patterns but the authors, so the total and the pages agree. `undefined` for a graph id that
 * is not a full one.
 */
export function paperCountQuery(contextGraph: string): string | undefined {
  const where = publishedPapers(contextGraph);
  return where && `SELECT (COUNT(DISTINCT ?paper) AS ?total) ${where}`;
}

/**
 * The SPARQL query that finds `ual` among the papers {@link paperListQuery} lists, with the
 * same patterns but the authors: one row when it is a paper our node published in the graph
 * (a Target KA, so never an R-KA), none otherwise (ADR 0011). `undefined` for a UAL that is
 * not canonical (ADR 0031) or a graph id that is not a full one.
 */
export function publishedPaperQuery(contextGraph: string, ual: string): string | undefined {
  const normalized = normalizeUal(ual);
  if (!normalized.ok || normalized.ual !== ual) return undefined;
  const where = publishedPapers(contextGraph, false, ual);
  return where && `SELECT ?ka ${where}\nLIMIT 1`;
}

/**
 * The SPARQL query for the first `first` authors of each listed paper, by position, each read
 * from its own asset's graph (from its UAL), read by {@link parsePaperAuthors}. Only papers
 * with a canonical CID and a UAL the graph's agent minted go in; `undefined` when none is left, for a graph
 * id that is not a full one, or when `first` is not a positive integer.
 */
export function paperAuthorsQuery(
  contextGraph: string,
  papers: readonly { readonly cid: string; readonly ual: string }[],
  first: number,
): string | undefined {
  if (!wholeNumber(first) || first < 1) return undefined;
  const pairs = papers.flatMap(({ cid, ual }) => {
    const graph = assetGraphIri(contextGraph, ual);
    return canonicalCid(cid) === cid && graph ? [`(<${PAPER}${cid}> <${graph}>)`] : [];
  });
  if (pairs.length === 0) return undefined;
  return `SELECT ?paper ?authorName ?authorPosition WHERE {
  VALUES (?paper ?g) { ${pairs.join(" ")} }
  GRAPH ?g {
    ?paper <${SCHEMA}author> ?listed .
    ?listed <${SCHEMA}name> ?authorName ;
      <${SCHEMA}position> ?authorPosition .
  }
  FILTER(?authorPosition <= ${first})
}`;
}

/**
 * The listings in the rows of {@link paperListQuery}, in the node's order, each paper once.
 * A row whose CID is not canonical, or whose fields are missing or do not parse, is left out:
 * it could not link to a page.
 */
export function parsePaperListing(bindings: readonly QueryBinding[]): PaperListing[] {
  const listings: PaperListing[] = [];
  for (const row of bindings) {
    const listing = listingOf(row);
    if (listing && !listings.some((seen) => seen.cid === listing.cid)) listings.push(listing);
  }
  return listings;
}

/** The total in the row of {@link paperCountQuery}, or `undefined` when it does not parse. */
export function parsePaperCount(bindings: readonly QueryBinding[]): number | undefined {
  const total = text(bindings[0]?.total);
  return total !== undefined && DIGITS.test(total) && wholeNumber(Number(total))
    ? Number(total)
    : undefined;
}

/**
 * Each paper's first authors, in position order, from the rows of {@link paperAuthorsQuery},
 * keyed by CID. A paper with no author has no entry.
 */
export function parsePaperAuthors(
  bindings: readonly QueryBinding[],
): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, { name: string; position: number }[]>();
  for (const row of bindings) {
    const cid = paperCid(row.paper);
    const name = text(row.authorName);
    const position = text(row.authorPosition);
    if (!cid || !name || position === undefined || !DIGITS.test(position)) continue;
    const names = found.get(cid) ?? [];
    names.push({ name, position: Number(position) });
    found.set(cid, names);
  }
  return new Map(
    [...found].map(([cid, names]) => [
      cid,
      names.sort((a, b) => a.position - b.position).map((author) => author.name),
    ]),
  );
}

function listingOf(row: QueryBinding): PaperListing | undefined {
  const cid = paperCid(row.paper);
  const ual = normalizeUal(row.ual ?? "");
  const publishedAt = isoDate(text(row.publishedAt));
  const title = text(row.title);
  const submitter = text(row.submitter);
  const signature = text(row.signature);
  const deadline = text(row.deadline);
  const authorCount = text(row.authorCount);
  if (!cid || !ual.ok || !publishedAt || !title || !submitter || !signature) return undefined;
  if (deadline === undefined || !DIGITS.test(deadline)) return undefined;
  if (authorCount === undefined || !DIGITS.test(authorCount)) return undefined;
  return {
    cid,
    ual: ual.ual,
    publishedAt,
    title,
    submitter,
    signature,
    deadline: BigInt(deadline),
    authorCount: Number(authorCount),
  };
}

/** The canonical CID a paper's subject names, or `undefined`. */
function paperCid(subject: string | undefined): string | undefined {
  if (!subject?.startsWith(PAPER)) return undefined;
  const cid = subject.slice(PAPER.length);
  return canonicalCid(cid) === cid ? cid : undefined;
}

function text(term: string | undefined): string | undefined {
  return term === undefined ? undefined : unquote(term);
}

function isoDate(value: string | undefined): string | undefined {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function wholeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
