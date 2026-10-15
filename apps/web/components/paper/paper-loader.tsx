import { getUploadService } from "@verisci/workflows";
import { Suspense } from "react";
import { readProgress } from "../../lib/publish/upload-actions.ts";
import { RatingsSection } from "../rating/ratings-section.tsx";
import { RatingsSkeleton } from "../rating/ratings-skeleton.tsx";
import { PaperProgress } from "./paper-progress.tsx";

/**
 * Reads where a paper stands on the server, inside its page's `Suspense`, and hands that
 * first view to `PaperProgress`, which follows it from there: a published paper's record
 * arrives as HTML, with nothing left to ask. Below a published paper, its ratings stream in
 * their own `Suspense`, read from the chain.
 */
export async function PaperLoader({
  cid,
  eventId,
  resubmitted,
}: {
  cid: string;
  /** The Inngest event its run started from, from `?event=`. */
  eventId: string | undefined;
  /** The visitor just submitted a paper that was already published. */
  resubmitted: boolean;
}) {
  const service = getUploadService();
  const initial = await readProgress(cid, eventId, service);
  return (
    <div className="grid gap-10">
      <PaperProgress
        cid={cid}
        contextGraph={service.contextGraph}
        eventId={eventId}
        initial={initial}
        resubmitted={resubmitted}
      />
      {initial.stage === "published" && (
        <Suspense fallback={<RatingsSkeleton />}>
          <RatingsSection ual={initial.ual} cid={cid} />
        </Suspense>
      )}
    </div>
  );
}
