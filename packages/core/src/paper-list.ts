import { TARGET_KA_PREFIX } from "./asset-names.ts";
import { canonicalCid } from "./cid.ts";
import { type QueryBinding, unquote } from "./paper-record.ts";
import { VERISCI_NS } from "./target-ka.ts";
import { normalizeUal } from "./ual.ts";

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
}

/** A paper's first authors, in their order on the paper, and how many it has. */
export interface PaperAuthors {
  readonly first: readonly string[];
  readonly count: number;
}

const SCHEMA = "http://schema.org/";
const DKG = "http://dkg.io/ontology/";
const PAPER = `${VERISCI_NS}paper:`;
/** A full context graph id whose name an IRI and a string literal can both hold. */
const GRAPH_ID = /^0x[0-9a-fA-F]{40}\/[^/\s<>"{}|^`\\]+$/;
const DIGITS = /^\d+$/;

/**
 * The patterns that pick the graph's published papers: each minted Target KA in the graph's
 * `_meta` (its UAL and the mint's date), joined to its triples. The node's `_meta` layout and
 * the need for `GRAPH ?g` are in `docs/domain.md` → DKG. `undefined` for a graph id that is
 * not a full one.
 */
function publishedPapers(contextGraph: string): string | undefined {
  if (!GRAPH_ID.test(contextGraph)) return undefined;
  const graph = `did:dkg:context-graph:${contextGraph}`;
  return `WHERE {
  GRAPH <${graph}/_meta> {
    ?asset <${DKG}memoryLayer> "VM" ;
      <${DKG}kaUal> ?ka .
    ?ka <${DKG}publishedAt> ?minted .
  }
  FILTER(STRSTARTS(STR(?asset), "${graph}/assertion/") && CONTAINS(STR(?asset), "/${TARGET_KA_PREFIX}"))
  BIND(IRI(CONCAT("${PAPER}", STRAFTER(STR(?asset), "/${TARGET_KA_PREFIX}"))) AS ?paper)
  GRAPH ?g {
    ?paper a <${SCHEMA}ScholarlyArticle> ;
      <${SCHEMA}name> ?name ;
      <${VERISCI_NS}submitter> ?by ;
      <${VERISCI_NS}signature> ?signed ;
      <${VERISCI_NS}deadline> ?until .
  }
}`;
}

/**
 * The SPARQL query for one page of the graph's published papers, newest mint first: one row
 * per paper, read by {@link parsePaperListing}. `undefined` for a graph id that is not a full
 * one, a limit below 1, or a limit or offset that is not a safe integer.
 */
export function paperListQuery(
  contextGraph: string,
  page: { readonly limit: number; readonly offset: number },
): string | undefined {
  const where = publishedPapers(contextGraph);
  if (!where || !wholeNumber(page.limit) || page.limit < 1 || !wholeNumber(page.offset)) {
    return undefined;
  }
  return `SELECT ?paper (SAMPLE(?ka) AS ?ual) (MAX(?minted) AS ?publishedAt) (SAMPLE(?name) AS ?title) (SAMPLE(?by) AS ?submitter) (SAMPLE(?signed) AS ?signature) (SAMPLE(?until) AS ?deadline)
${where}
GROUP BY ?paper
ORDER BY DESC(?publishedAt) ?paper
LIMIT ${page.limit} OFFSET ${page.offset}`;
}

/**
 * The SPARQL query counting the papers {@link paperListQuery} pages through, with the same
 * patterns, so the total and the pages agree. `undefined` for a graph id that is not a full one.
 */
export function paperCountQuery(contextGraph: string): string | undefined {
  const where = publishedPapers(contextGraph);
  return where && `SELECT (COUNT(DISTINCT ?paper) AS ?total) ${where}`;
}

/**
 * The SPARQL query for the first `first` authors of each paper, by position, and each paper's
 * author count, read by {@link parsePaperAuthors}. Only canonical CIDs go in; `undefined` when
 * none is left or `first` is not a positive integer.
 */
export function paperAuthorsQuery(cids: readonly string[], first: number): string | undefined {
  if (!wholeNumber(first) || first < 1) return undefined;
  const papers = cids.filter((cid) => canonicalCid(cid) === cid).map((cid) => `<${PAPER}${cid}>`);
  if (papers.length === 0) return undefined;
  return `SELECT ?paper ?authorName ?authorPosition ?authorCount WHERE {
  {
    SELECT ?paper (COUNT(DISTINCT ?author) AS ?authorCount) WHERE {
      VALUES ?paper { ${papers.join(" ")} }
      ?paper <${SCHEMA}author> ?author .
    }
    GROUP BY ?paper
  }
  ?paper <${SCHEMA}author> ?listed .
  ?listed <${SCHEMA}name> ?authorName ;
    <${SCHEMA}position> ?authorPosition .
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
 * Each paper's first authors, in position order, and its author count, from the rows of
 * {@link paperAuthorsQuery}, keyed by CID. A paper with no author has no entry.
 */
export function parsePaperAuthors(
  bindings: readonly QueryBinding[],
): ReadonlyMap<string, PaperAuthors> {
  const found = new Map<string, { names: { name: string; position: number }[]; count: number }>();
  for (const row of bindings) {
    const cid = paperCid(row.paper);
    if (!cid) continue;
    const entry = found.get(cid) ?? { names: [], count: 0 };
    found.set(cid, entry);
    const count = text(row.authorCount);
    if (count !== undefined && DIGITS.test(count)) entry.count = Number(count);
    const name = text(row.authorName);
    const position = text(row.authorPosition);
    if (name && position !== undefined && DIGITS.test(position)) {
      entry.names.push({ name, position: Number(position) });
    }
  }
  return new Map(
    [...found].map(([cid, { names, count }]) => [
      cid,
      {
        first: names.sort((a, b) => a.position - b.position).map((author) => author.name),
        count: Math.max(count, names.length),
      },
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
  if (!cid || !ual.ok || !publishedAt || !title || !submitter || !signature) return undefined;
  if (deadline === undefined || !DIGITS.test(deadline)) return undefined;
  return {
    cid,
    ual: ual.ual,
    publishedAt,
    title,
    submitter,
    signature,
    deadline: BigInt(deadline),
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
