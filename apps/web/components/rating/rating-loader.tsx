import { getRatingService, getUploadService } from "@verisci/workflows";
import { notFound } from "next/navigation";
import { readProgress } from "../../lib/publish/upload-actions.ts";
import { ratingChainConfig } from "../../lib/rating/chain.ts";
import { shorten } from "../../lib/shorten.ts";
import { createWebEnv } from "../../lib/web-env.ts";
import { RatingProgress } from "./rating-progress.tsx";

/**
 * Reads a rating and its paper's title on the server, inside the rating page's `Suspense`,
 * and hands them to `RatingProgress`, which follows the rating from there. A rating no
 * contract holds, or one of another paper, is the not-found page; a chain that did not answer
 * is followed until it does.
 */
export async function RatingLoader({ cid, requestId }: { cid: string; requestId: string }) {
  const [view, paper] = await Promise.all([
    getRatingService().readRating(requestId),
    readProgress(cid, undefined, getUploadService()),
  ]);
  if (!view.ok && view.reason === "not-found") notFound();
  const ual = paper.stage === "published" ? paper.ual : undefined;
  if (view.ok && view.rating.targetUal !== ual) notFound();
  const title = paper.stage === "published" && paper.record ? paper.record.title : shorten(cid);
  return (
    <RatingProgress
      cid={cid}
      title={title}
      requestId={requestId.toLowerCase()}
      initial={view}
      local={ratingChainConfig(createWebEnv())?.local ?? false}
    />
  );
}
