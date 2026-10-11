/**
 * The papers table's shape while the DKG node answers: a header line and placeholder rows,
 * one stacked cell on phones, the date, submitter and signature columns from `md`.
 */
export function PapersTableSkeleton({ rows }: { rows: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading papers"
      className="glass overflow-hidden rounded-2xl px-2 sm:px-4"
    >
      <div className="flex h-10 items-center gap-3 border-b border-line px-3">
        <Bar className="w-12" />
        <Bar className="ml-auto hidden w-16 md:block" />
        <Bar className="hidden w-20 md:block" />
        <Bar className="hidden w-16 md:block" />
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows with nothing else to key on
          key={row}
          data-skeleton-row
          className="flex gap-3 border-b border-line px-3 py-4 last:border-0"
        >
          <div className="grid flex-1 gap-2">
            <Bar className="h-4 w-11/12" />
            <Bar className="w-1/2" />
            <Bar className="w-2/3 md:hidden" />
          </div>
          <Bar className="hidden w-20 md:block" />
          <Bar className="hidden w-24 md:block" />
          <Bar className="hidden w-14 md:block" />
        </div>
      ))}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`h-3 animate-pulse rounded-md bg-surface-strong ${className}`} />;
}
