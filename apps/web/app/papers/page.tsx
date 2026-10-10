import { getUploadService } from "@verisci/workflows";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Pager } from "../../components/pager.tsx";
import { PapersTable } from "../../components/papers-table.tsx";
import {
  PAPERS_PER_PAGE,
  type PapersView,
  pageHref,
  papersView,
  parsePageParam,
} from "../../lib/papers.ts";

type SearchParams = Promise<{ page?: string | string[] }>;

/** "Papers · VeriSci", naming the page past the first. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  return {
    title: page !== undefined && page > 1 ? `Papers, page ${page} · VeriSci` : "Papers · VeriSci",
  };
}

/**
 * Every paper published in this environment, newest first, one page per URL
 * (`/papers?page=N`): the server reads only that page from the DKG. A page that is not a
 * positive whole number, or past the last, answers 404.
 */
export default async function PapersPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const page = parsePageParam((await searchParams).page);
  if (page === undefined) notFound();
  const view = papersView(
    await getUploadService().listPapers({ page, pageSize: PAPERS_PER_PAGE }),
    page,
  );
  if (view.kind === "not-found") notFound();

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Published papers</h1>
        <p className="max-w-[65ch] leading-relaxed text-muted">
          Each paper here is a Knowledge Asset on the DKG, minted on Base Sepolia. Open one to read
          its record and check who submitted it.
        </p>
      </header>
      <PapersBody view={view} page={page} />
    </div>
  );
}

function PapersBody({ view, page }: { view: PapersView; page: number }) {
  switch (view.kind) {
    case "list":
      return (
        <div className="grid gap-6">
          <p className="text-sm text-muted">
            {view.lastPage > 1
              ? `${papersCount(view.total)} · page ${page} of ${view.lastPage}`
              : papersCount(view.total)}
          </p>
          <div className="glass rounded-2xl px-2 sm:px-4">
            <PapersTable papers={view.papers} />
          </div>
          <Pager page={page} lastPage={view.lastPage} />
        </div>
      );
    case "empty":
      return (
        <p className="glass rounded-2xl p-5 leading-relaxed text-muted">
          No paper is published yet.{" "}
          <Link href="/publish" className="font-medium text-accent hover:underline">
            Publish the first one
          </Link>
        </p>
      );
    case "unavailable":
      return (
        <p role="alert" className="glass rounded-2xl p-5 leading-relaxed text-muted">
          The list can't be loaded right now: the DKG node didn't answer.{" "}
          <Link href={pageHref(page)} className="font-medium text-accent hover:underline">
            Try again
          </Link>
        </p>
      );
    default:
      return (
        <p role="alert" className="glass rounded-2xl p-5 leading-relaxed text-muted">
          The DKG node answered, but the list couldn't be read. Try again later.
        </p>
      );
  }
}

function papersCount(total: number): string {
  return total === 1 ? "1 paper" : `${total} papers`;
}
