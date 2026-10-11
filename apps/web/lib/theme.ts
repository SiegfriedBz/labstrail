/** The site's two themes. Light is the default; dark applies once the visitor picks it. */
export type Theme = "light" | "dark";

/** Where the visitor's choice is kept, in this browser's `localStorage`. */
export const THEME_KEY = "verisci-theme";

/** The theme to show: the visitor's stored choice, else light. */
export function resolveTheme(stored: string | null): Theme {
  return stored === "dark" ? "dark" : "light";
}

/**
 * Runs in `<head>`, before the first paint: sets `<html data-theme>` the way `resolveTheme`
 * does. Storage can be blocked (a private window, say): the page stays light then.
 */
export const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}document.documentElement.dataset.theme=t==="dark"?"dark":"light"})()`;
