/** The rating page's shape while the chain and the node answer: breadcrumbs, score, checks. */
export function RatingPageSkeleton() {
  return (
    <div aria-busy className="grid gap-6">
      <div className="h-5 w-56 animate-pulse rounded-md bg-surface-strong" />
      <div className="grid gap-3">
        <div className="h-6 w-24 animate-pulse rounded-md bg-surface-strong" />
        <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-surface-strong" />
      </div>
      <div className="glass grid gap-4 rounded-2xl p-5 sm:p-6">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="h-14 animate-pulse rounded-xl bg-surface-strong" />
        ))}
      </div>
    </div>
  );
}
