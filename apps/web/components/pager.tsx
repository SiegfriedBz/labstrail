import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { pageHref, pageLinks } from "../lib/papers.ts";

const STEP =
  "inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-strong hover:text-ink";

/**
 * The papers list's page links: where the visitor is, each page number (with gaps between
 * distant ones), and Previous and Next where such a page exists. Plain links, so each page
 * is a URL the server renders. Nothing for a single page.
 */
export function Pager({ page, lastPage }: { page: number; lastPage: number }) {
  const links = pageLinks(page, lastPage);
  if (links.length === 0) return null;
  return (
    <nav
      aria-label="Pages"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-muted">
        Page {page} of {lastPage}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        {page > 1 && (
          <li>
            <Link href={pageHref(page - 1)} className={STEP}>
              <CaretLeft aria-hidden size={14} weight="bold" />
              Previous
            </Link>
          </li>
        )}
        {links.map((link, index) =>
          link === "gap" ? (
            <li key={`gap-${links[index - 1]}`} aria-hidden className="px-1 text-sm text-muted">
              …
            </li>
          ) : (
            <li key={link}>
              <Link
                href={pageHref(link)}
                aria-current={link === page ? "page" : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 font-mono text-sm transition-colors ${
                  link === page
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-strong hover:text-ink"
                }`}
              >
                {link}
              </Link>
            </li>
          ),
        )}
        {page < lastPage && (
          <li>
            <Link href={pageHref(page + 1)} className={STEP}>
              Next
              <CaretRight aria-hidden size={14} weight="bold" />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
