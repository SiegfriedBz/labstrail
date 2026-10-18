import { describeFailure, getRatingService, getUploadService } from "@verisci/workflows";
import { ImageResponse } from "next/og";
import { readProgress } from "../../../lib/publish/upload-actions.ts";
import { ratingChainConfig } from "../../../lib/rating/chain.ts";
import { shareAssets } from "../../../lib/seo/share-assets.ts";
import {
  type PaperCard,
  paperCardFor,
  SHARE_SIZE,
  ShareCard,
} from "../../../lib/seo/share-card.tsx";
import { createWebEnv } from "../../../lib/web-env.ts";

export const alt =
  "A paper on VeriSci, with its title, its authors and its reproducibility readiness score";
export const size = SHARE_SIZE;
export const contentType = "image/png";

/**
 * The image a paper's link shares (ADR 0040): its title, authors and latest score, or the
 * site's card when it is not published or the node or the chain did not answer
 * (`paperCardFor`), never an error.
 */
export default async function Image({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const [{ fonts, logo }, paper] = await Promise.all([shareAssets(), cardOf(cid)]);
  return new ImageResponse(<ShareCard logo={logo} paper={paper} />, { ...size, fonts });
}

/** The paper's card, or `undefined` for the site's; a read that throws is logged, never shown. */
async function cardOf(cid: string): Promise<PaperCard | undefined> {
  try {
    const view = await readProgress(cid, undefined, getUploadService());
    if (view.stage !== "published") return undefined;
    const ratings = ratingChainConfig(createWebEnv())
      ? await getRatingService().listRatings(view.ual)
      : undefined;
    return paperCardFor(view, ratings);
  } catch (error) {
    console.warn(`share-card-unavailable: ${describeFailure(error)}`);
    return undefined;
  }
}
