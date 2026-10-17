import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const REQUEST_ID = `0x${"ab".repeat(32)}`;

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("../../../../../components/rating/rating-loader.tsx", () => ({
  RatingLoader: (props: { cid: string; requestId: string; fresh: boolean }) => (
    <p>Rating {JSON.stringify(props)}</p>
  ),
}));

const { default: RatingPage } = await import("./page.tsx");

describe("/papers/[cid]/ratings/[requestId]", () => {
  afterEach(cleanup);

  it("reads the rating inside its Suspense boundary", async () => {
    render(
      await RatingPage({
        params: Promise.resolve({ cid: CID, requestId: REQUEST_ID }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText(
        `Rating ${JSON.stringify({ cid: CID, requestId: REQUEST_ID, fresh: false })}`,
      ),
    ).toBeTruthy();
  });

  it("tells the loader the page was opened right after the request (?new=1)", async () => {
    render(
      await RatingPage({
        params: Promise.resolve({ cid: CID, requestId: REQUEST_ID }),
        searchParams: Promise.resolve({ new: "1" }),
      }),
    );

    expect(
      screen.getByText(
        `Rating ${JSON.stringify({ cid: CID, requestId: REQUEST_ID, fresh: true })}`,
      ),
    ).toBeTruthy();
  });

  it("answers 404 for an id that is not a request id, before anything streams", async () => {
    await expect(
      RatingPage({
        params: Promise.resolve({ cid: CID, requestId: "7" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
