import { canonicalCid } from "@verisci/core";
import type { PublishedRecord } from "@verisci/workflows";
import type { Metadata } from "next";
import type { PaperView } from "../publish/upload-actions.ts";
import { SITE } from "../site.ts";
import { clip } from "./clip.ts";

/** The title of a paper's page that search results leave out, by its stage. */
const STAGE_TITLES: Record<Exclude<PaperView["stage"], "not-found">, string> = {
  reading: "Publishing a paper",
  saving: "Publishing a paper",
  minting: "Publishing a paper",
  following: "Publishing a paper",
  refused: "Paper not published",
  "not-published": "Paper not published",
  failed: "Publishing stopped",
  unavailable: "Paper",
  published: "Paper",
};

/**
 * A paper page's metadata (ADR 0040), canonical at `/papers/<canonical CID>` whatever the
 * address's spelling and query. A published paper with its record is titled after itself,
 * described by its abstract (or, without one, its title and authors' count), and shared as an
 * article with its authors and mint date. `not-found` when the node has no such paper and no
 * run is followed, for the page to answer 404. Any other stage, or a record the node did not
 * answer for, is kept out of search results.
 */
export function paperMetadata(cid: string, view: PaperView): Metadata | "not-found" {
  if (view.stage === "not-found") return "not-found";
  const canonical = `/papers/${canonicalCid(cid) ?? cid}`;
  if (view.stage !== "published" || !view.record) {
    return {
      title: STAGE_TITLES[view.stage],
      alternates: { canonical },
      robots: { index: false },
    };
  }
  const { record } = view;
  return {
    title: record.title,
    description: record.abstract ? clip(record.abstract) : clip(summaryOf(record)),
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: SITE.name,
      url: canonical,
      authors: [...record.authors],
      ...(record.publishedAt ? { publishedTime: record.publishedAt } : {}),
    },
  };
}

/** A paper without an abstract, in one sentence: its title, its authors' count, and where it is. */
function summaryOf(record: PublishedRecord): string {
  const count = record.authors.length;
  const by = count === 0 ? "" : `, by ${count} ${count === 1 ? "author" : "authors"}`;
  return `${record.title}${by}, published on the OriginTrail DKG and rated for reproducibility readiness on ${SITE.name}.`;
}
