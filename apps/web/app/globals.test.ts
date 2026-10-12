// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** The `--name: #hex` tokens of the first block that opens with `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, hex]) => [
      name,
      String(hex),
    ]),
  );
}

/** WCAG 2's contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((at) => {
      const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const light = tokens(":root");
const themes = {
  light,
  // The dark block sets only what changes; `accent-deep` is shared.
  dark: { ...light, ...tokens(':root[data-theme="dark"]') },
};

describe("globals.css's palette", () => {
  it("reads every colour token of both themes", () => {
    for (const theme of Object.values(themes)) {
      for (const name of ["page", "ink", "muted", "accent", "accent-2", "accent-ink", "danger"])
        expect(theme[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(Object.entries(themes))("keeps text readable in the %s theme (WCAG AA)", (_, theme) => {
    const on = (text: string, ground: string) =>
      contrast(String(theme[text]), String(theme[ground]));

    for (const text of ["ink", "muted", "accent", "danger"])
      expect(on(text, "page"), `${text} on page`).toBeGreaterThanOrEqual(4.5);
    expect(on("accent-ink", "accent"), "accent-ink on accent").toBeGreaterThanOrEqual(4.5);
    expect(
      contrast("#ffffff", String(theme["accent-deep"])),
      "white on accent-deep",
    ).toBeGreaterThanOrEqual(4.5);
    expect(on("accent-2", "page"), "accent-2 on page").toBeGreaterThanOrEqual(3);
  });

  it("keeps muted text and the accent readable on the dark theme's panels", () => {
    const { dark } = themes;

    expect(contrast(String(dark.muted), String(dark.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(String(dark.accent), String(dark.surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("finds an unreadable pair unreadable", () => {
    expect(contrast("#777777", "#888888")).toBeLessThan(3);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
