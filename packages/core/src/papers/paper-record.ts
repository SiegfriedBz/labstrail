import { assetGraphIri } from "../assets/asset-graph.ts";
import { canonicalCid } from "../assets/cid.ts";
import { VERISCI_NS } from "../publish/target-ka.ts";

/** One row of a SPARQL answer, as the DKG node gives it: IRIs bare, literals quoted. */
export type QueryBinding = Readonly<Record<string, string>>;

/** A published paper's record, as read back from its Target KA. */
export interface PaperRecord {
  readonly title: string;
  /** In their order on the paper. */
  readonly authors: readonly string[];
  readonly abstract?: string;
  readonly doi?: string;
  /** The PDF's `ipfs://` link. */
  readonly pdf: string;
  /** The submitter's lowercase address. */
  readonly submitter: string;
  readonly signature: string;
  /** The signed deadline, in Unix seconds. */
  readonly deadline: bigint;
}

const SCHEMA = "http://schema.org/";
const DOI_PREFIX = "https://doi.org/";

/**
 * The SPARQL query that reads a paper's Target KA, minted as `ual` in `contextGraph`: each of
 * its triples, with each author's name and position, from that asset's own graph only, so
 * another asset's triples about the same paper never mix in. `undefined` for a CID that is
 * not canonical, a graph id that is not a full one, or a UAL that does not parse or that
 * another agent than the graph's minted.
 */
export function paperRecordQuery(
  cid: string,
  contextGraph: string,
  ual: string,
): string | undefined {
  const graph = assetGraphIri(contextGraph, ual);
  if (canonicalCid(cid) !== cid || !graph) return undefined;
  return `SELECT ?p ?o ?authorName ?authorPosition WHERE {
  GRAPH <${graph}> {
    <${VERISCI_NS}paper:${cid}> ?p ?o .
    OPTIONAL { ?o <${SCHEMA}name> ?authorName . ?o <${SCHEMA}position> ?authorPosition . }
  }
}`;
}

/**
 * A paper's record from the rows of {@link paperRecordQuery}, or `undefined` when a field the
 * Target KA always has (title, PDF link, submitter, signature, deadline) is missing or
 * malformed. Pure: reads only the rows.
 */
export function parsePaperRecord(
  cid: string,
  bindings: readonly QueryBinding[],
): PaperRecord | undefined {
  const values = (predicate: string) =>
    bindings.filter((row) => row.p === predicate).map((row) => row.o ?? "");
  const text = (predicate: string) => {
    const [first] = values(predicate);
    return first === undefined ? undefined : unquote(first);
  };

  const title = text(`${SCHEMA}name`);
  const submitter = text(`${VERISCI_NS}submitter`);
  const signature = text(`${VERISCI_NS}signature`);
  const deadline = text(`${VERISCI_NS}deadline`);
  const pdf = values(`${SCHEMA}url`).find((url) => url === `ipfs://${cid}`);
  if (!title || !submitter || !signature || !pdf || !deadline || !/^\d+$/.test(deadline))
    return undefined;

  const authors = bindings
    .filter((row) => row.p === `${SCHEMA}author` && row.authorName && row.authorPosition)
    .map((row) => ({
      name: unquote(row.authorName ?? ""),
      position: Number(unquote(row.authorPosition ?? "")),
    }))
    .sort((a, b) => a.position - b.position)
    .map((author) => author.name);
  const abstract = text(`${SCHEMA}abstract`);
  const doi = values(`${SCHEMA}sameAs`)
    .find((url) => url.startsWith(DOI_PREFIX))
    ?.slice(DOI_PREFIX.length);

  return {
    title,
    authors,
    ...(abstract ? { abstract } : {}),
    ...(doi ? { doi } : {}),
    pdf,
    submitter,
    signature,
    deadline: BigInt(deadline),
  };
}

/** What each one-letter escape in an N-Triples literal stands for. */
const ESCAPES: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

/** Unicode's last code point, U+10FFFF. */
const LAST_CODE_POINT = 0x10ffff;

/**
 * The text of a quoted literal (`"a\"b"`, `"7"^^<…>`, `"x"@en`); a bare IRI unchanged. Decodes
 * the N-Triples escapes the DKG writes: `\n`, `\r`, `\t`, `\b`, `\f`, `\uXXXX`, `\UXXXXXXXX`,
 * and a backslash before any other character stands for that character. A `\U` past the last
 * Unicode code point stays as written.
 */
export function unquote(term: string): string {
  const match = /^"((?:[^"\\]|\\.)*)"(?:\^\^<[^>]*>|@[a-zA-Z-]+)?$/s.exec(term);
  if (!match) return term;
  return (match[1] ?? "").replace(
    /\\(?:u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|(.))/gs,
    (written: string, short?: string, long?: string, char?: string) => {
      const code = short ?? long;
      if (code === undefined) return ESCAPES[char ?? ""] ?? char ?? "";
      const point = Number.parseInt(code, 16);
      return point <= LAST_CODE_POINT ? String.fromCodePoint(point) : written;
    },
  );
}
