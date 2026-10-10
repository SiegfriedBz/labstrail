import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaperLoader } from "../../../components/paper/paper-loader.tsx";
import { PaperSkeleton } from "../../../components/paper/paper-skeleton.tsx";

export const metadata: Metadata = { title: "Paper · VeriSci" };

/**
 * A paper's page: where its publish stands, from `?event=` (its run) and the DKG. The server
 * reads it in a `Suspense` boundary, showing a skeleton of the page until the node answers;
 * the page then follows the paper from that first view.
 */
export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ cid: string }>;
  searchParams: Promise<{ event?: string | string[]; already?: string | string[] }>;
}) {
  await connection();
  const { cid } = await params;
  const { event, already } = await searchParams;
  const eventId = typeof event === "string" ? event : undefined;
  return (
    <Suspense
      key={`${cid}:${eventId ?? ""}`}
      fallback={<PaperSkeleton cid={cid} following={eventId !== undefined} />}
    >
      <PaperLoader cid={cid} eventId={eventId} resubmitted={already === "1"} />
    </Suspense>
  );
}
