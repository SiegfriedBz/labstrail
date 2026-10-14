import { getRatingService, type RatingSummary } from "@verisci/workflows";
import Link from "next/link";
import { formatPublished } from "../../lib/papers/papers.ts";
import { ratingChainConfig } from "../../lib/rating/chain.ts";
import { createWebEnv } from "../../lib/web-env.ts";
import { RATING_INTRO, RATING_TITLE } from "./labels.ts";
import { RateButton } from "./rate-button.tsx";

/**
 * A published paper's ratings, read from the environment's contracts on the server inside the
 * paper page's `Suspense`: the latest score (the contract's, ADR 0014), every rating oldest
 * first with a link to its page, and the button that requests a new one. Reads nothing where
 * no contract takes ratings (no deployment, or locally without the Anvil settings).
 */
export async function RatingsSection({ ual, cid }: { ual: string; cid: string }) {
  const config = ratingChainConfig(createWebEnv());
  if (!config) {
    return (
      <Section>
        <p className="text-sm leading-relaxed text-muted">
          Ratings aren't set up here: no rating contract is deployed for this environment.
        </p>
      </Section>
    );
  }
  const list = await getRatingService().listRatings(ual);
  if (!list.ok) {
    return (
      <Section>
        <p role="alert" className="text-sm leading-relaxed text-muted">
          Ratings can't be loaded right now: the chain didn't answer.{" "}
          <Link href={`/papers/${cid}`} className="link">
            Try again
          </Link>
        </p>
      </Section>
    );
  }
  const latest = list.ratings.filter((rating) => rating.status === "fulfilled").at(-1);
  const pending = list.ratings.some((rating) => rating.status === "pending");
  return (
    <Section>
      <div className="grid gap-1">
        {latest ? (
          <p className="flex items-baseline gap-2">
            <span
              data-testid="latest-score"
              className="font-mono text-5xl font-semibold tracking-tight text-accent-2"
            >
              {latest.score}
            </span>
            <span className="text-sm text-muted">/ 100, the latest score recorded on chain</span>
          </p>
        ) : (
          <p className="text-lg font-semibold">
            {pending ? "Rating in progress" : "Not rated yet"}
          </p>
        )}
      </div>
      {list.ratings.length > 0 && (
        <ol className="grid divide-y divide-line rounded-xl border border-line">
          {list.ratings.map((rating) => (
            <RatingRow key={rating.requestId} rating={rating} cid={cid} />
          ))}
        </ol>
      )}
      <div className="grid gap-2">
        <RateButton ual={ual} cid={cid} config={config} />
        <p className="text-xs leading-relaxed text-muted">
          {config.local
            ? "Local mode: requests go to the Anvil chain on this computer."
            : "Free on testnet: you pay only gas. A wallet can have 3 ratings waiting at a time."}
        </p>
      </div>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="rating-title"
      className="glass enter grid gap-5 rounded-2xl p-5 sm:p-6"
    >
      <div className="grid gap-1">
        <h2 id="rating-title" className="text-lg font-semibold">
          {RATING_TITLE}
        </h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted">{RATING_INTRO}</p>
      </div>
      {children}
    </section>
  );
}

const STATUS = {
  fulfilled: "Scored",
  pending: "In progress",
  cancelled: "Cancelled",
} as const;

/** One rating: its day, its status, its score or why it stopped, and a link to its page. */
function RatingRow({ rating, cid }: { rating: RatingSummary; cid: string }) {
  const outcome =
    rating.status === "fulfilled"
      ? `${rating.score} / 100`
      : rating.status === "cancelled"
        ? rating.cancelReason === "invalid-target"
          ? "Can't be rated"
          : "Couldn't finish in a day"
        : STATUS.pending;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
      <span className="text-muted">
        {formatPublished(new Date(rating.requestedAt * 1000).toISOString())}
      </span>
      <span className={rating.status === "fulfilled" ? "font-mono text-accent-2" : "text-muted"}>
        {rating.status === "pending" ? outcome : `${STATUS[rating.status]}: ${outcome}`}
      </span>
      <Link href={`/papers/${cid}/ratings/${rating.requestId}`} className="link">
        Details
      </Link>
    </li>
  );
}
