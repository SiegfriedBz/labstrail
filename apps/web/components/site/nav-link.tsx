"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A header link that shows when its section is the one open (its page or one under it, so
 * Papers on a paper's and a rating's page): brighter, underlined in blue.
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const current = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`text-sm font-medium underline-offset-[6px] transition-colors ${
        current ? "text-ink underline decoration-accent decoration-2" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
