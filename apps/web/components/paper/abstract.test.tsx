import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Abstract } from "./abstract.tsx";

const LONG =
  "The honeybee pathogen deformed wing virus enters host cells through a membrane protein. ".repeat(
    8,
  );

describe("Abstract", () => {
  afterEach(cleanup);

  it("cuts a long abstract short, with a toggle that shows all of it and back", () => {
    render(<Abstract text={LONG} />);

    expect(screen.getByRole("heading", { name: "Abstract" })).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Read more" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("shows a short abstract whole, with no toggle", () => {
    render(<Abstract text="A short abstract." />);

    expect(screen.getByText("A short abstract.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
