import { afterEach, describe, expect, it } from "vitest";
import { resolveTheme, THEME_KEY, THEME_SCRIPT } from "./theme.ts";

/** Runs the inline script with a stored choice, or none. */
function runScript(stored: string | null) {
  if (stored === null) localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, stored);
  new Function(THEME_SCRIPT)();
}

describe("resolveTheme", () => {
  it("takes the visitor's stored choice", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });

  it("is light when nothing valid is stored", () => {
    expect(resolveTheme(null)).toBe("light");
    expect(resolveTheme("sepia")).toBe("light");
  });
});

describe("THEME_SCRIPT", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("sets the stored theme on <html> before React runs", () => {
    runScript("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("sets light when nothing is stored", () => {
    document.documentElement.dataset.theme = "dark";
    runScript(null);

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
