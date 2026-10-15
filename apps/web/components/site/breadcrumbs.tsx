import Link from "next/link";

/** One step of the trail: a page with its link, or the current page without one. */
export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/**
 * Where the page sits in the site, such as "Papers / <title> / Rating": each step links back,
 * the last, the current page, is marked as such, and the trail stays on one line: a title in
 * the middle is cut short before anything else, and the last step only when it is the title
 * itself ("Papers / <title>").
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm text-muted">
        {items.map((item, index) =>
          index < items.length - 1 ? (
            <li
              key={item.label}
              className={`flex items-center gap-2 ${index === 0 ? "shrink-0" : "min-w-0 shrink-[100]"}`}
            >
              {item.href ? (
                <Link href={item.href} className="block truncate transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                <span className="block truncate">{item.label}</span>
              )}
              <span aria-hidden className="shrink-0">
                /
              </span>
            </li>
          ) : (
            <li
              key={item.label}
              aria-current="page"
              className={`text-ink ${items.length > 2 ? "shrink-0" : "min-w-0"}`}
            >
              {/* In a span: globals.css's unlayered `li { text-wrap: pretty }` beats `truncate`. */}
              <span className="block truncate">{item.label}</span>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
