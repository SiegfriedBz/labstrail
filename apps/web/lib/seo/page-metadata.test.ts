import type { PublishedRecord } from "@verisci/workflows";
import { describe, expect, it } from "vitest";
import type { PaperView } from "../publish/upload-actions.ts";
import { paperMetadata } from "./page-metadata.ts";

const CID = "bafybeias652m2pfpmuaeze4dxmtcjvfwvr7dsteumagdd2vwaqrbkjokxu";
/** The same file's CID in its CIDv0 spelling. */
const V0 = "QmeuWS7yCDk5yJEY1JC3zsp1WQeArgyU1Q4shjP7njFBcn";
const V0_CANONICAL = "bafybeihwexgn2z6ffhokgkcu55hyrq6pc4v2pnkdvpj6nc63durj4q6b6m";
const UAL = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/6";

const record: PublishedRecord = {
  title: "Screening VP1 of deformed wing virus",
  authors: ["Di Liu", "Yuting Xiao", "Hongmei Li", "Jun Guo"],
  abstract:
    "Deformed wing virus is a major threat to honeybees worldwide. We screened the capsid protein VP1 for epitopes that neutralise the virus in cell culture and in larvae, and mapped them to its surface.",
  pdf: `ipfs://${CID}`,
  submitter: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
  signature: "0xefa5",
  deadline: "1791639162",
  signatureCheck: "valid",
  publisher: "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3",
  publishedAt: "2026-10-17T08:42:01.123Z",
};
const published: PaperView = { stage: "published", ual: UAL, record };

describe("paperMetadata", () => {
  it("titles a published paper after itself, described by its abstract, as an article", () => {
    const metadata = paperMetadata(CID, published);

    expect(metadata).toMatchObject({
      title: record.title,
      alternates: { canonical: `/papers/${CID}` },
      openGraph: {
        type: "article",
        siteName: "VeriSci",
        url: `/papers/${CID}`,
        authors: record.authors,
        publishedTime: "2026-10-17T08:42:01.123Z",
      },
    });
    expect(metadata).not.toHaveProperty("robots");
    const description = metadata === "not-found" ? "" : String(metadata.description);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description).toMatch(
      /^Deformed wing virus is a major threat to honeybees worldwide\. .*…$/,
    );
  });

  it("gives every spelling of the CID the canonical one", () => {
    expect(paperMetadata(V0, published)).toMatchObject({
      alternates: { canonical: `/papers/${V0_CANONICAL}` },
    });
  });

  it("describes a paper without an abstract by its title and its authors' count", () => {
    const { abstract: _abstract, publishedAt: _publishedAt, ...bare } = record;

    const metadata = paperMetadata(CID, { stage: "published", ual: UAL, record: bare });

    expect(metadata).toMatchObject({
      description: `${record.title}, by 4 authors, published on the OriginTrail DKG and rated for reproducibility readiness on VeriSci.`,
    });
    expect(metadata === "not-found" ? {} : metadata.openGraph).not.toHaveProperty("publishedTime");
  });

  it("says one author", () => {
    const { abstract: _abstract, ...bare } = record;

    expect(
      paperMetadata(CID, {
        stage: "published",
        ual: UAL,
        record: { ...bare, authors: ["Di Liu"] },
      }),
    ).toMatchObject({ description: expect.stringContaining(", by 1 author, published") });
  });

  it("is not found when the node has no such paper and no run is followed", () => {
    expect(paperMetadata(CID, { stage: "not-found" })).toBe("not-found");
  });

  it.each([
    [{ stage: "reading" }, "Publishing a paper"],
    [{ stage: "saving" }, "Publishing a paper"],
    [{ stage: "minting" }, "Publishing a paper"],
    [{ stage: "following" }, "Publishing a paper"],
    [{ stage: "refused", reason: "outside-field" }, "Paper not published"],
    [{ stage: "not-published" }, "Paper not published"],
    [{ stage: "failed" }, "Publishing stopped"],
    [{ stage: "unavailable" }, "Paper"],
    [{ stage: "published", ual: UAL, recordProblem: "unavailable" }, "Paper"],
  ] satisfies [PaperView, string][])("keeps %j out of search results, titled %s", (view, title) => {
    expect(paperMetadata(CID, view)).toEqual({
      title,
      alternates: { canonical: `/papers/${CID}` },
      robots: { index: false },
    });
  });
});
