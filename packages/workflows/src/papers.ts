import {
  canonicalContextGraph,
  paperAuthorsQuery,
  paperCountQuery,
  paperListQuery,
  parsePaperAuthors,
  parsePaperCount,
  parsePaperListing,
} from "@verisci/core";
import type { DkgClient, DkgFailure } from "@verisci/dkg";
import { signatureMatches, type VerifyOptions } from "./publish/verify-submission.ts";

/** The largest page `listPapers` reads. */
const MAX_PAGE_SIZE = 50;
/** How many of each paper's authors the list shows by name. */
const FIRST_AUTHORS = 3;

/** A published paper as the papers list shows it. */
export interface PaperSummary {
  /** The PDF's canonical CID: the paper's page is `/papers/<cid>`. */
  readonly cid: string;
  /** The Target KA's UAL, normalized (ADR 0031). */
  readonly ual: string;
  /** When the node minted it, as an ISO date-time. */
  readonly publishedAt: string;
  readonly title: string;
  /** The first three authors, in their order on the paper. */
  readonly authors: readonly string[];
  /** How many authors the paper has in all. */
  readonly authorCount: number;
  /** The submitter's address, as the Target KA records it. */
  readonly submitter: string;
  /** Whether the signature is the submitter's, checked when read: `unknown` if the chain did not answer. */
  readonly signatureCheck: SignatureCheck;
}

/** A signature check as the pages show it. */
export type SignatureCheck = "valid" | "invalid" | "unknown";

/**
 * One page of the papers list with the total, or why it cannot be shown: `unavailable` when
 * the node did not answer (worth asking again), `unreadable` when it refused a query or
 * answered one that does not parse (ADR 0021).
 */
export type PaperListResult =
  | { readonly ok: true; readonly total: number; readonly papers: readonly PaperSummary[] }
  | { readonly ok: false; readonly reason: QueryProblem };

/** Why a query's answer cannot be used. */
export type QueryProblem = "unavailable" | "unreadable";

/** What {@link listPapers} reads with. */
export interface PaperListDeps {
  /** This environment's context graph id, as the node spells it. */
  readonly contextGraph: string;
  readonly query: DkgClient["query"];
  /** Asks the chain about smart-contract wallets' signatures. */
  readonly chain: VerifyOptions["client"];
}

/**
 * One page of the graph's published papers, newest mint first, with the total
 * (`docs/domain.md` → DKG): the page and the count are asked at once, then the page's first
 * authors, then each signature is checked as the paper's page checks it. A page past the
 * last gives no papers and the total. Throws a `RangeError` for a page or page size that is
 * not a positive integer, or a page size over 50: a bug in the caller, not an expected
 * failure.
 */
export async function listPapers(
  options: { readonly page: number; readonly pageSize: number },
  deps: PaperListDeps,
): Promise<PaperListResult> {
  const { page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  if (!positive(page) || !positive(pageSize) || pageSize > MAX_PAGE_SIZE || !positive(offset + 1)) {
    throw new RangeError(`no page ${page} of ${pageSize} papers`);
  }
  const listQuery = paperListQuery(deps.contextGraph, { limit: pageSize, offset });
  const countQuery = paperCountQuery(deps.contextGraph);
  if (!listQuery || !countQuery) return { ok: false, reason: "unreadable" };

  const [listed, counted] = await Promise.all([deps.query(listQuery), deps.query(countQuery)]);
  if (!listed.ok) return { ok: false, reason: queryProblem(listed) };
  if (!counted.ok) return { ok: false, reason: queryProblem(counted) };
  const total = parsePaperCount(counted.bindings);
  if (total === undefined) return { ok: false, reason: "unreadable" };
  const listings = parsePaperListing(listed.bindings);
  const authorsQuery = paperAuthorsQuery(
    listings.map((listing) => listing.cid),
    FIRST_AUTHORS,
  );
  if (!authorsQuery) return { ok: true, total, papers: [] };

  const answered = await deps.query(authorsQuery);
  if (!answered.ok) return { ok: false, reason: queryProblem(answered) };
  const authors = parsePaperAuthors(answered.bindings);
  const contextGraph = canonicalContextGraph(deps.contextGraph);
  const papers = await Promise.all(
    listings.map(async (listing): Promise<PaperSummary> => {
      const byline = authors.get(listing.cid);
      const matches = await signatureMatches({ ...listing, contextGraph }, deps.chain);
      return {
        cid: listing.cid,
        ual: listing.ual,
        publishedAt: listing.publishedAt,
        title: listing.title,
        authors: byline?.first ?? [],
        authorCount: byline?.count ?? 0,
        submitter: listing.submitter,
        signatureCheck: signatureCheck(matches),
      };
    }),
  );
  return { ok: true, total, papers };
}

/**
 * Why a failed query cannot be used: `unavailable` when the node did not answer, asked to
 * retry, or answered 429 or a server error; `unreadable` when it refused the query.
 */
export function queryProblem(failure: DkgFailure): QueryProblem {
  const passing =
    failure.reason === "unreachable" ||
    failure.reason === "retry-later" ||
    failure.status === 429 ||
    (failure.status !== undefined && failure.status >= 500);
  return passing ? "unavailable" : "unreadable";
}

/** A signature check from `signatureMatches`: `unreachable` (the chain did not answer) is `unknown`. */
export function signatureCheck(matches: boolean | "unreachable"): SignatureCheck {
  return matches === "unreachable" ? "unknown" : matches ? "valid" : "invalid";
}

function positive(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
