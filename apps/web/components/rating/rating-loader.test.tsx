import { cleanup, render, screen } from "@testing-library/react";
import type { PaperStatus, RatingView } from "@verisci/workflows";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const readRating = vi.fn<(id: string) => Promise<RatingView>>();
const readPaper = vi.fn<(cid: string) => Promise<PaperStatus>>();

vi.mock("@verisci/workflows", () => ({
  getRatingService: () => ({ readRating }),
  getUploadService: () => ({ readPaper }),
}));
let env: Record<string, string | undefined> = { APP_ENV: "staging" };
vi.mock("../../lib/web-env.ts", () => ({ createWebEnv: () => env }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./rating-progress.tsx", () => ({
  RatingProgress: (props: { title: string; local: boolean; nodeDown?: boolean }) => (
    <p>
      progress of {props.title}, local {String(props.local)}, node down{" "}
      {String(props.nodeDown ?? false)}
    </p>
  ),
}));

const { RatingLoader } = await import("./rating-loader.tsx");

const PUBLISHED: PaperStatus = {
  asset: { ok: true, state: "minted", ual: UAL },
  run: undefined,
  record: {
    title: "RNAi therapies",
    authors: [],
    pdf: `ipfs://${CID}`,
    submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    signature: "0x",
    deadline: "1",
    signatureCheck: "valid",
    publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
  },
};
const PENDING: RatingView = {
  ok: true,
  rating: {
    requestId: REQUEST_ID,
    contract: "0xa",
    status: "pending",
    requestedAt: 1,
    targetUal: UAL,
  },
  stage: "scoring",
};

describe("RatingLoader", () => {
  afterEach(() => {
    cleanup();
    readRating.mockReset();
    readPaper.mockReset();
    env = { APP_ENV: "staging" };
  });

  it("reads the rating and the paper's title for its page", async () => {
    readRating.mockResolvedValue(PENDING);
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(readRating).toHaveBeenCalledWith(REQUEST_ID);
    expect(
      screen.getByText("progress of RNAi therapies, local false, node down false"),
    ).toBeTruthy();
  });

  it("is not found when the rating is of another paper", async () => {
    readRating.mockResolvedValue({
      ...PENDING,
      rating: { ...(PENDING.ok ? PENDING.rating : ({} as never)), targetUal: `${UAL}0` },
    } as RatingView);
    readPaper.mockResolvedValue(PUBLISHED);

    await expect(RatingLoader({ cid: CID, requestId: REQUEST_ID })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("is not found when no contract holds the id", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "not-found" });
    readPaper.mockResolvedValue(PUBLISHED);

    await expect(RatingLoader({ cid: CID, requestId: REQUEST_ID })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("still follows a rating the chain didn't answer for", async () => {
    readRating.mockResolvedValue({ ok: false, reason: "unavailable" });
    readPaper.mockResolvedValue(PUBLISHED);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(screen.getByText(/progress of RNAi therapies/)).toBeTruthy();
  });

  it("still shows the rating, under the paper's short address, when the node doesn't answer", async () => {
    readRating.mockResolvedValue(PENDING);
    readPaper.mockResolvedValue({
      asset: { ok: false, reason: "unreachable" },
      run: undefined,
    } as unknown as PaperStatus);

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(screen.getByText(/progress of bafybe.*, node down true/)).toBeTruthy();
  });

  it("says ratings aren't set up, and reads nothing, where no contract takes them", async () => {
    env = { APP_ENV: "local" };

    render(await RatingLoader({ cid: CID, requestId: REQUEST_ID }));

    expect(readRating).not.toHaveBeenCalled();
    expect(screen.getByText(/aren't set up here/)).toBeTruthy();
  });
});
