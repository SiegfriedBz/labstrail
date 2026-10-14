import { RATING_INTRO, RATING_TITLE } from "./labels.ts";

/** The Rating section's shape while the chain answers: its real heading, the score pulsing. */
export function RatingsSkeleton() {
  return (
    <section aria-busy className="glass grid gap-5 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">{RATING_TITLE}</h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted">{RATING_INTRO}</p>
      </div>
      <div className="h-12 w-28 animate-pulse rounded-lg bg-surface-strong" />
      <div className="h-10 w-40 animate-pulse rounded-xl bg-surface-strong" />
    </section>
  );
}
