import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "../../lib/theme.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("switches the page to the other theme and remembers the choice", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to the dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("follows a theme set elsewhere on the page", async () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);

    await act(async () => {
      document.documentElement.dataset.theme = "dark";
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Switch to the light theme" })).toBeTruthy();
  });
});
