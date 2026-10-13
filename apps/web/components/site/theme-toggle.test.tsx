import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "../../lib/theme.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

const NAME = "Switch between light and dark";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("switches the page to the other theme and remembers the choice", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: NAME }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  });

  it("switches from the theme on the page when clicked, whatever set it", () => {
    render(<ThemeToggle />);
    document.documentElement.dataset.theme = "dark";

    fireEvent.click(screen.getByRole("button", { name: NAME }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("carries both icons, so CSS shows the right one before JavaScript runs", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: NAME }).querySelectorAll("svg")).toHaveLength(2);
  });
});
