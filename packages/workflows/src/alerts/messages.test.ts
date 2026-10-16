import { describe, expect, it } from "vitest";
import { publishedText, ratedText, siteUrlOf } from "./messages.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const SITE = "https://verisci.example";

describe("siteUrlOf", () => {
  it("gives the address a message links to: production's, develop's branch URL, or localhost", () => {
    expect(
      siteUrlOf({ APP_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "verisci.example" }),
    ).toBe("https://verisci.example");
    expect(
      siteUrlOf({ APP_ENV: "staging", VERCEL_BRANCH_URL: "verisci-git-develop.vercel.app" }),
    ).toBe("https://verisci-git-develop.vercel.app");
    expect(siteUrlOf({ APP_ENV: "local" })).toBe("http://localhost:3000");
  });

  it("is undefined when Vercel gave no address, so messages carry no link", () => {
    expect(siteUrlOf({ APP_ENV: "production" })).toBeUndefined();
    expect(siteUrlOf({ APP_ENV: "staging" })).toBeUndefined();
  });
});

describe("publishedText", () => {
  it("names the paper by its title, with a link to its page", () => {
    expect(publishedText({ cid: CID, title: "RNAi therapies" }, SITE)).toBe(
      `Published: RNAi therapies\n${SITE}/papers/${CID}`,
    );
  });

  it("names it by its CID when the run didn't read the title, and leaves the link out without a site", () => {
    expect(publishedText({ cid: CID }, undefined)).toBe(`Published: ${CID}`);
  });

  it("names it by its CID when its title is empty", () => {
    expect(publishedText({ cid: CID, title: "" }, undefined)).toBe(`Published: ${CID}`);
  });
});

describe("ratedText", () => {
  const paper = { requestId: REQUEST_ID, targetUal: TARGET, cid: CID, title: "RNAi therapies" };

  it("gives a score out of 100, the paper and the rating's page", () => {
    expect(ratedText({ state: "fulfilled", score: 67 }, paper, SITE)).toBe(
      `Rated 67/100: RNAi therapies\n${SITE}/papers/${CID}/ratings/${REQUEST_ID}`,
    );
  });

  it.each([
    ["invalid-target", "can't be rated"],
    ["expired", "not finished within a day"],
  ] as const)("says why a rating was cancelled %s", (reason, words) => {
    expect(ratedText({ state: "cancelled", reason }, paper, undefined)).toBe(
      `Rating cancelled, ${words}: RNAi therapies`,
    );
  });

  it("names a paper it never read by its UAL, with no link", () => {
    expect(
      ratedText(
        { state: "cancelled", reason: "invalid-target" },
        { requestId: REQUEST_ID, targetUal: TARGET },
        SITE,
      ),
    ).toBe(`Rating cancelled, can't be rated: ${TARGET}`);
  });

  it("names a paper whose title is empty by its UAL", () => {
    expect(ratedText({ state: "fulfilled", score: 64 }, { ...paper, title: "" }, undefined)).toBe(
      `Rated 64/100: ${TARGET}`,
    );
  });
});
