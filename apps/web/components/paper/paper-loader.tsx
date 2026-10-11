import { getUploadService } from "@verisci/workflows";
import { readProgress } from "../../lib/upload-actions.ts";
import { PaperProgress } from "./paper-progress.tsx";

/**
 * Reads where a paper stands on the server, inside its page's `Suspense`, and hands that
 * first view to `PaperProgress`, which follows it from there: a published paper's record
 * arrives as HTML, with nothing left to ask.
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
    <PaperProgress
      cid={cid}
      contextGraph={service.contextGraph}
      eventId={eventId}
      initial={initial}
      resubmitted={resubmitted}
    />
  );
}
