import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
/** Whether the mocked read has answered, or is still waiting on the node. */
let readArrives = true;
const never = new Promise<never>(() => {});

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../../../components/paper/paper-loader.tsx", () => ({
  PaperLoader: (props: { cid: string; eventId?: string; resubmitted: boolean }) => {
    if (!readArrives) use(never);
    return <p>Paper {JSON.stringify(props)}</p>;
  },
}));

const { default: PaperPage } = await import("./page.tsx");

async function show(search: Record<string, string | string[]> = {}) {
  render(
    await PaperPage({
      params: Promise.resolve({ cid: CID }),
      searchParams: Promise.resolve(search),
    }),
  );
}

describe("/papers/[cid]", () => {
  afterEach(() => {
    cleanup();
    readArrives = true;
  });

  it("reads the paper with the event and the resubmitted flag from the address", async () => {
    await show({ event: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7", already: "1" });

    expect(
      screen.getByText(
        `Paper ${JSON.stringify({ cid: CID, eventId: "01K7C2M4X8Q9R1S2T3V4W5Y6Z7", resubmitted: true })}`,
      ),
    ).toBeTruthy();
  });

  it("ignores a repeated event", async () => {
    await show({ event: ["a", "b"] });

    expect(
      screen.getByText(`Paper ${JSON.stringify({ cid: CID, resubmitted: false })}`),
    ).toBeTruthy();
  });

  it("shows a skeleton of the paper until the node answers", async () => {
    readArrives = false;

    await show();

    expect(screen.getByRole("status", { name: "Loading paper" })).toBeTruthy();
    expect(screen.queryByText(/^Paper /)).toBeNull();
  });
});
