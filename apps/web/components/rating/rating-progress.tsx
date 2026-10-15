"use client";

import type { RatingView } from "@verisci/workflows";
import { useEffect, useState } from "react";
import { requestedAgo, takingLong } from "../../lib/rating/elapsed.ts";
import { cancelMessage } from "../../lib/rating/messages.ts";
import { isFinalRating, type RatingPageStage, ratingStage } from "../../lib/rating/stage.ts";
import { StepChain } from "../paper/progress-chain.tsx";
import { Breadcrumbs } from "../site/breadcrumbs.tsx";
import { RatingDetail } from "./rating-detail.tsx";
import { RATING_STEPS as STEPS } from "./rating-steps.ts";

const POLL_MS = 5000;

/** How often the time since the request is redrawn. */
const CLOCK_MS = 30_000;

/** What a rating running past `SLOW_AFTER_MS` adds to the panel. */
const SLOW_NOTE =
  "This is taking longer than usual, most often because the scoring model is busy. VeriSci keeps trying. If the rating can't finish within a day, the request is cancelled and you can ask again.";

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
  /** The browser's clock, read after hydration so the server's render and the first client one match. */
  const [now, setNow] = useState<number>();

  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(clock);
  }, []);

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

  const pending = view.ok && view.rating.status === "pending";
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
        {pending && now !== undefined && (
          <p className="text-sm text-muted">{requestedAgo(view.rating.requestedAt, now)}</p>
        )}
      </div>
      <Body
        stage={stage}
        view={view}
        local={local}
        slow={pending && now !== undefined && takingLong(view.rating.requestedAt, now)}
      />
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
      return STEPS.find((step) => step.stage === stage.stage)?.headline ?? "";
  }
}

function Body({
  stage,
  view,
  local,
  slow,
}: {
  stage: RatingPageStage;
  view: RatingView;
  local: boolean;
  /** The rating has run past `SLOW_AFTER_MS`. */
  slow: boolean;
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
      <StepChain
        label="Rating steps"
        steps={STEPS}
        done={Math.max(current, 0)}
        active={current >= 0 ? current : undefined}
      />
      <aside className="glass grid content-start gap-2 rounded-2xl p-5 sm:p-6">
        <h2 className="text-sm font-semibold">What's happening</h2>
        <p className="text-sm leading-relaxed text-muted">
          {current >= 0
            ? STEPS[current]?.now
            : "We couldn't read this rating's progress right now and are asking again every few seconds."}
        </p>
        {slow && <p className="text-sm leading-relaxed text-ink">{SLOW_NOTE}</p>}
      </aside>
    </div>
  );
}
