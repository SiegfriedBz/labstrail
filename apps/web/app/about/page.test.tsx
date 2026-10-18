import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE } from "../../lib/site.ts";
import AboutPage, { metadata } from "./page.tsx";

describe("/about", () => {
  afterEach(cleanup);

  it("says what VeriSci is and who builds it, with the code and the maintainer's profile", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("About VeriSci");
    expect(screen.getByText(SITE.definition)).toBeTruthy();
    expect(screen.getByText(/Siegfried Bozza/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /GitHub/ }).getAttribute("href")).toBe(SITE.repo);
    expect(screen.getByRole("link", { name: /LinkedIn/ }).getAttribute("href")).toBe(
      SITE.maintainer.linkedIn,
    );
  });

  it("says the records live on testnets until mainnet", () => {
    render(<AboutPage />);

    expect(screen.getByText(/Base Sepolia/)).toBeTruthy();
    expect(screen.getByText(/mainnet/)).toBeTruthy();
  });

  it("tells VeriSci apart from the 2020 SciFact model of the same name", () => {
    render(<AboutPage />);

    expect(screen.getByText(/SciFact/)).toBeTruthy();
  });

  it("has its own title, description and canonical address", () => {
    expect(metadata).toMatchObject({ title: "About", alternates: { canonical: "/about" } });
    expect(metadata.description).not.toBe(SITE.description);
  });
});
