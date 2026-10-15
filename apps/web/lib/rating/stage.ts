import type { RatingView } from "@verisci/workflows";

/**
 * What a rating's page shows: a pending rating's step (scored, saved, minted, then recorded on
 * chain by the oracle), its score once fulfilled, why it was cancelled, or why it cannot be
 * read right now.
 */
export type RatingPageStage =
  | { readonly stage: "scoring" | "saving" | "minting" | "recording" }
  | { readonly stage: "scored"; readonly score: number }
  | { readonly stage: "cancelled"; readonly reason: "invalid-target" | "expired" }
  | { readonly stage: "not-found" | "unavailable" };

/** The stage `readRating`'s answer shows; a pending rating the node did not answer for is `unavailable`. */
export function ratingStage(view: RatingView): RatingPageStage {
  if (!view.ok) return { stage: view.reason };
  const { rating } = view;
  if (rating.status === "fulfilled") return { stage: "scored", score: rating.score ?? 0 };
  if (rating.status === "cancelled")
    return { stage: "cancelled", reason: rating.cancelReason ?? "expired" };
  const step = view.stage ?? "unknown";
  return step === "unknown" ? { stage: "unavailable" } : { stage: step };
}

/** Whether the page stops following: the rating is scored or cancelled, or no contract holds it. */
export function isFinalRating(stage: RatingPageStage): boolean {
  return stage.stage === "scored" || stage.stage === "cancelled" || stage.stage === "not-found";
}

/** Whether `value` reads as a phase-1 request id: `0x` + 64 hex digits, any case. */
export function isRequestId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}
