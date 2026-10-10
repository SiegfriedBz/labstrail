import Link from "next/link";

/** One step of the trail: a page with its link, or the current page without one. */
export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/**
 * Where the page sits in the site, such as "Papers / <title>": each step links back, and the
 * last, the current page, is marked as such and cut short on one line.
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm text-muted">
        {items.map((item, index) =>
          index < items.length - 1 ? (
            <li key={item.label} className="flex shrink-0 items-center gap-2">
              {item.href ? (
                <Link href={item.href} className="transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                item.label
              )}
              <span aria-hidden>/</span>
            </li>
          ) : (
            <li key={item.label} aria-current="page" className="min-w-0 text-ink">
              {/* In a span: globals.css's unlayered `li { text-wrap: pretty }` beats `truncate`. */}
              <span className="block truncate">{item.label}</span>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
