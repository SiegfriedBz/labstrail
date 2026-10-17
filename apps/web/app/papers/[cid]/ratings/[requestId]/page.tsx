import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RatingLoader } from "../../../../../components/rating/rating-loader.tsx";
import { RatingPageSkeleton } from "../../../../../components/rating/rating-page-skeleton.tsx";
import { isRequestId } from "../../../../../lib/rating/stage.ts";

export const metadata: Metadata = { title: "Rating · VeriSci" };

/**
 * One rating's page: its score with every check, answer and quote behind it, or where it stands
 * while it runs. An id that is not a request id is a 404 before anything streams; the rating is
 * read in a `Suspense` boundary, with a skeleton until the chain and the node answer. `?new=1`,
 * which the Rate button adds, marks a request just made, which the chain may not show yet.
 */
export default async function RatingPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string; requestId: string }>;
  searchParams: Promise<{ new?: string | string[] }>;
}) {
  await connection();
  const { cid, requestId } = await params;
  if (!isRequestId(requestId)) notFound();
  const fresh = (await searchParams).new === "1";
  return (
    <Suspense key={requestId} fallback={<RatingPageSkeleton />}>
      <RatingLoader cid={cid} requestId={requestId} fresh={fresh} />
    </Suspense>
  );
}
