import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PapersResults } from "../../components/papers/papers-results.tsx";
import { PapersTableSkeleton } from "../../components/papers/papers-table-skeleton.tsx";
import { PAPERS_PER_PAGE, parsePageParam } from "../../lib/papers.ts";

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
 * (`/papers?page=N`): the server reads only that page from the DKG. The heading shows at
 * once and a skeleton of the table until the page arrives; keyed by page, so moving to
 * another page shows the skeleton again. A page that is not a positive whole number, or is
 * too far out to read (`parsePageParam`), answers 404 before anything streams.
 */
export default async function PapersPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const page = parsePageParam((await searchParams).page);
  if (page === undefined) notFound();

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Published papers</h1>
        <p className="max-w-[65ch] leading-relaxed text-muted">
          Each paper here is a Knowledge Asset on the DKG, minted on Base Sepolia. Open one to read
          its record and check who submitted it.
        </p>
      </header>
      <Suspense
        key={page}
        fallback={
          <div className="grid gap-6">
            <div className="h-5 w-40 animate-pulse rounded-md bg-surface-strong" />
            <PapersTableSkeleton rows={Math.min(PAPERS_PER_PAGE, 8)} />
          </div>
        }
      >
        <PapersResults page={page} />
      </Suspense>
    </div>
  );
}
