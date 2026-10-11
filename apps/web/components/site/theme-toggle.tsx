"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";
import { THEME_KEY, type Theme } from "../../lib/theme.ts";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function pageTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/**
 * The theme on the page, in step with `<html data-theme>` (set first by `THEME_SCRIPT`).
 * Light while hydrating, as the server renders it.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, pageTheme, () => "light");
}

/**
 * A button that switches to the other theme and remembers the choice in this browser. Its
 * name is the same in both themes and CSS picks its icon (a moon in light, a sun in dark),
 * so it is right before JavaScript runs.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => applyTheme(pageTheme() === "dark" ? "light" : "dark")}
      aria-label="Switch between light and dark"
      title="Switch between light and dark"
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-strong text-muted transition hover:bg-surface-strong hover:text-ink active:scale-[0.96]"
    >
      <Moon aria-hidden size={16} weight="bold" className="dark:hidden" />
      <Sun aria-hidden size={16} weight="bold" className="hidden dark:block" />
    </button>
  );
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage is blocked: the choice holds until the page is left.
  }
}
