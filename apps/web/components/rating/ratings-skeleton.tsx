import { RATINGS_TITLE, READINESS_INTRO, READINESS_TITLE } from "./labels.ts";

/**
 * The ratings section's shape while the chain answers: its real headings, the score and the
 * button pulsing. It holds the section's `#rating` anchor, so the papers list's Rate link lands
 * here before the section streams in.
 */
export function RatingsSkeleton() {
  return (
    <section id="rating" aria-busy className="glass grid scroll-mt-24 gap-6 rounded-2xl p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{RATINGS_TITLE}</h2>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">{READINESS_TITLE}</h3>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted">{READINESS_INTRO}</p>
        </div>
        <div className="h-12 w-28 animate-pulse rounded-lg bg-surface-strong" />
        <div className="h-10 w-40 animate-pulse rounded-xl bg-surface-strong" />
      </div>
    </section>
  );
}
