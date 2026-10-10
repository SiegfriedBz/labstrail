import { canonicalCid } from "@verisci/core";
import { shorten } from "../../lib/shorten.ts";
import { Breadcrumbs } from "../site/breadcrumbs.tsx";

/**
 * A paper's page while the server reads it: the breadcrumbs, which only need the CID, then
 * the page's shape: the stage, the title, the authors and the publish chain, and from `md`
 * the record panel beside them.
 */
export function PaperSkeleton({ cid }: { cid: string }) {
  return (
    <div className="grid gap-6">
      <Breadcrumbs
        items={[{ label: "Papers", href: "/papers" }, { label: shorten(canonicalCid(cid) ?? cid) }]}
      />
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading paper"
        className="grid items-start gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12"
      >
        <div className="grid content-start gap-6">
          <div className="grid gap-3">
            <Bar className="h-6 w-24" />
            <Bar className="h-8 w-full" />
            <Bar className="h-8 w-3/4" />
            <Bar className="mt-1 h-4 w-2/3" />
          </div>
          <div className="grid gap-2">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
          </div>
          <div className="grid gap-5">
            {["read", "saved", "minted", "published"].map((step) => (
              <div key={step} className="flex items-start gap-4">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-strong" />
                <div className="grid flex-1 gap-2 pt-1">
                  <Bar className="h-4 w-28" />
                  <Bar className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass grid gap-5 rounded-2xl p-5 sm:p-6">
          <Bar className="h-5 w-40" />
          {["submitter", "signature", "deadline", "token", "ual"].map((field) => (
            <div key={field} className="grid gap-2">
              <Bar className="h-3 w-24" />
              <Bar className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-strong ${className}`} />;
}
