import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** How the mocked list behaves: shown at once, or still waiting on the node. */
let listArrives = true;
const never = new Promise<never>(() => {});

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("../../components/papers/papers-results.tsx", () => ({
  PapersResults: ({ page }: { page: number }) => {
    if (!listArrives) use(never);
    return <p>Results for page {page}</p>;
  },
}));

const { default: PapersPage, generateMetadata } = await import("./page.tsx");

async function show(page?: string | string[]) {
  render(await PapersPage({ searchParams: Promise.resolve(page === undefined ? {} : { page }) }));
}

describe("/papers", () => {
  afterEach(() => {
    cleanup();
    listArrives = true;
  });

  it("shows the heading, then the page's results", async () => {
    await show("2");

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Published papers");
    expect(screen.getByText("Results for page 2")).toBeTruthy();
  });

  it("reads no page as page 1", async () => {
    await show();

    expect(screen.getByText("Results for page 1")).toBeTruthy();
  });

  it("shows a skeleton of the table until the list arrives", async () => {
    listArrives = false;

    await show("2");

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByLabelText("Loading papers")).toBeTruthy();
    expect(screen.queryByText(/Results for page/)).toBeNull();
  });

  it.each(["0", "01", "abc"])("answers 404 for ?page=%s before anything streams", async (page) => {
    await expect(show(page)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("generateMetadata", () => {
  it("titles the first page, and names later ones", async () => {
    const title = async (page?: string) =>
      (await generateMetadata({ searchParams: Promise.resolve(page ? { page } : {}) })).title;

    expect(await title()).toBe("Papers · VeriSci");
    expect(await title("2")).toBe("Papers, page 2 · VeriSci");
    expect(await title("abc")).toBe("Papers · VeriSci");
  });
});
