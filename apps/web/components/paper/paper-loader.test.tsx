import { cleanup, render, screen } from "@testing-library/react";
import type { PaperStatus } from "@verisci/workflows";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
const EVENT_ID = "01K7C2M4X8Q9R1S2T3V4W5Y6Z7";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";
const readPaper = vi.fn<(cid: string, eventId?: string) => Promise<PaperStatus>>();

vi.mock("@verisci/workflows", () => ({
  getUploadService: () => ({
    contextGraph: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/verisci-staging",
    readPaper,
  }),
}));

const { PaperLoader } = await import("./paper-loader.tsx");

describe("PaperLoader", () => {
  afterEach(() => {
    cleanup();
    readPaper.mockReset();
    vi.unstubAllGlobals();
  });

  it("reads the paper on the server and shows its record, with nothing left to ask", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "minted", ual: UAL },
      run: undefined,
      record: {
        title: "Screening VP1 of deformed wing virus",
        authors: ["Di Liu"],
        pdf: `ipfs://${CID}`,
        submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        signature: "0xefa5",
        deadline: "1791639162",
        signatureCheck: "valid",
        publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
      },
    });

    render(await PaperLoader({ cid: CID, eventId: undefined, resubmitted: false }));

    expect(readPaper).toHaveBeenCalledWith(CID, undefined);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Screening VP1 of deformed wing virus",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks about the run its event started", async () => {
    readPaper.mockResolvedValue({
      asset: { ok: true, state: "draft" },
      run: { ok: true, run: { state: "running" } },
    });

    render(await PaperLoader({ cid: CID, eventId: EVENT_ID, resubmitted: false }));

    expect(readPaper).toHaveBeenCalledWith(CID, EVENT_ID);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Saving the record");
  });
});
