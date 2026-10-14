"use client";

import type { RatingView } from "@verisci/workflows";
import { useEffect, useState } from "react";
import { cancelMessage } from "../../lib/rating/messages.ts";
import { isFinalRating, type RatingPageStage, ratingStage } from "../../lib/rating/stage.ts";
import { Breadcrumbs } from "../site/breadcrumbs.tsx";
import { RatingDetail } from "./rating-detail.tsx";

const POLL_MS = 5000;

/** The steps a pending rating goes through, in order (ADRs 0011, 0019). */
const STEPS = [
  {
    stage: "scoring",
    title: "Scoring the paper",
    now: "The scoring model reads the paper's text and answers its study type's checklist, quoting the passage behind each answer. Code checks every quote against the paper, then computes the score. When the model is busy, the rating is retried, which can take hours.",
  },
  {
    stage: "saving",
    title: "Saving the rating",
    now: "The rating is written to VeriSci's DKG node as its own Knowledge Asset, linked to the paper, which stays as it was.",
  },
  {
    stage: "minting",
    title: "Minting the rating",
    now: "The node mints the rating on Base as a Knowledge Asset, so its checks and quotes can't change unnoticed.",
  },
  {
    stage: "recording",
    title: "Recording the score on chain",
    now: "The oracle reads the score back from the minted rating and records it on the rating contract, next to the request.",
  },
] as const;

/**
 * Follows a rating from its page, starting from the view the server read (`RatingLoader`):
 * unless that view is final, asks `/api/ratings/<id>` every 5 s until it is scored, cancelled
 * or gone, and keeps asking through a view that could not be read.
 */
export function RatingProgress({
  cid,
  title,
  requestId,
  initial,
  local,
}: {
  cid: string;
  /** The paper's title, for the breadcrumbs. */
  title: string;
  requestId: string;
  initial: RatingView;
  /** True on Anvil, which no block explorer shows. */
  local: boolean;
}) {
  const [view, setView] = useState<RatingView>(initial);
  const stage = ratingStage(view);

  useEffect(() => {
    if (isFinalRating(ratingStage(initial))) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      let next: RatingView = { ok: false, reason: "unavailable" };
      try {
        const response = await fetch(`/api/ratings/${requestId}`, { cache: "no-store" });
        if (response.ok) next = (await response.json()) as RatingView;
      } catch {
        // Asked again on the next poll.
      }
      if (stopped) return;
      setView(next);
      if (!isFinalRating(ratingStage(next))) timer = setTimeout(() => void poll(), POLL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [requestId, initial]);

  return (
    <div className="grid gap-6">
      <Breadcrumbs
        items={[
          { label: "Papers", href: "/papers" },
          { label: title, href: `/papers/${cid}` },
          { label: "Rating" },
        ]}
      />
      <div className="enter grid gap-3">
        <p
          className={`w-fit rounded-md px-2.5 py-1 text-xs font-medium ${
            stage.stage === "scored"
              ? "bg-accent-2-soft text-accent-2"
              : "bg-surface-strong text-muted"
          }`}
        >
          {pillOf(stage)}
        </p>
        <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {headlineOf(stage)}
        </h1>
      </div>
      <Body stage={stage} view={view} local={local} />
    </div>
  );
}

function pillOf(stage: RatingPageStage): string {
  switch (stage.stage) {
    case "scored":
      return "Reproducibility readiness";
    case "cancelled":
      return "Cancelled";
    case "not-found":
      return "Not found";
    default:
      return "In progress";
  }
}

function headlineOf(stage: RatingPageStage): string {
  switch (stage.stage) {
    case "scored":
      return `Scored ${stage.score} / 100`;
    case "cancelled":
      return cancelMessage(stage.reason).title;
    case "not-found":
      return "No rating here";
    case "unavailable":
      return "Checking on this rating";
    default:
      return STEPS.find((step) => step.stage === stage.stage)?.title ?? "";
  }
}

function Body({
  stage,
  view,
  local,
}: {
  stage: RatingPageStage;
  view: RatingView;
  local: boolean;
}) {
  if (stage.stage === "scored" && view.ok) return <RatingDetail view={view} local={local} />;
  if (stage.stage === "cancelled") {
    return (
      <p className="max-w-[65ch] leading-relaxed text-muted">{cancelMessage(stage.reason).body}</p>
    );
  }
  if (stage.stage === "not-found") {
    return <p className="text-muted">No rating contract of this environment holds this request.</p>;
  }
  const current = STEPS.findIndex((step) => step.stage === stage.stage);
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <ol className="grid gap-3">
        {STEPS.map((step, index) => (
          <li
            key={step.stage}
            aria-current={index === current ? "step" : undefined}
            className={`rounded-xl border px-4 py-3 text-sm ${
              index === current
                ? "border-accent/60 bg-accent-soft text-ink"
                : index < current
                  ? "border-line text-ink"
                  : "border-line text-muted"
            }`}
          >
            {step.title}
          </li>
        ))}
      </ol>
      <aside className="glass grid content-start gap-2 rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm font-semibold">What's happening</h2>
        <p className="text-sm leading-relaxed text-muted">
          {current >= 0
            ? STEPS[current]?.now
            : "We couldn't read this rating's progress right now and are asking again every few seconds."}
        </p>
      </aside>
    </div>
  );
}
