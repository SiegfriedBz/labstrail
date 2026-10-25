import { describe, expect, it } from "vitest";
import { delayedNotice, publishedNotice, ratedNotice, siteUrlOf } from "./messages.ts";

const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const REQUEST_ID = `0x${"ab".repeat(32)}`;
const SITE = "https://labstrail.example";

describe("siteUrlOf", () => {
  it("gives the address a message links to: production's, develop's branch URL, or localhost", () => {
    expect(
      siteUrlOf({ APP_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "labstrail.example" }),
    ).toBe("https://labstrail.example");
    expect(
      siteUrlOf({ APP_ENV: "staging", VERCEL_BRANCH_URL: "labstrail-git-develop.vercel.app" }),
    ).toBe("https://labstrail-git-develop.vercel.app");
    expect(siteUrlOf({ APP_ENV: "local" })).toBe("http://localhost:3000");
  });

  it("is undefined when Vercel gave no address, so messages carry no link", () => {
    expect(siteUrlOf({ APP_ENV: "production" })).toBeUndefined();
    expect(siteUrlOf({ APP_ENV: "staging" })).toBeUndefined();
  });
});

describe("publishedNotice", () => {
  it("names the paper by its title, with a short link to its page", () => {
    expect(publishedNotice({ cid: CID, title: "RNAi therapies" }, SITE)).toEqual({
      level: "activity",
      text: "📄 Published",
      title: "RNAi therapies",
      link: { label: "Open the paper", url: `${SITE}/papers/${CID}` },
    });
  });

  it("names it by its CID when the run didn't read the title, and leaves the link out without a site", () => {
    expect(publishedNotice({ cid: CID }, undefined)).toEqual({
      level: "activity",
      text: "📄 Published",
      title: CID,
    });
  });

  it("names it by its CID when its title is empty", () => {
    expect(publishedNotice({ cid: CID, title: "" }, undefined).title).toBe(CID);
  });
});

describe("ratedNotice", () => {
  const paper = { requestId: REQUEST_ID, targetUal: TARGET, cid: CID, title: "RNAi therapies" };

  it("gives a score out of 100, the paper and a short link to the rating's page", () => {
    expect(ratedNotice({ state: "fulfilled", score: 67 }, paper, SITE)).toEqual({
      level: "activity",
      text: "⭐ Rated 67/100",
      title: "RNAi therapies",
      link: { label: "Open the rating", url: `${SITE}/papers/${CID}/ratings/${REQUEST_ID}` },
    });
  });

  it.each([
    ["invalid-target", "can't be rated"],
    ["expired", "not finished within a day"],
  ] as const)("says why a rating was cancelled %s", (reason, words) => {
    expect(ratedNotice({ state: "cancelled", reason }, paper, undefined)).toEqual({
      level: "activity",
      text: `⚠️ Rating cancelled: ${words}`,
      title: "RNAi therapies",
    });
  });

  it("names a paper it never read by its UAL, with no link", () => {
    expect(
      ratedNotice(
        { state: "cancelled", reason: "invalid-target" },
        { requestId: REQUEST_ID, targetUal: TARGET },
        SITE,
      ),
    ).toEqual({ level: "activity", text: "⚠️ Rating cancelled: can't be rated", title: TARGET });
  });

  it("names a paper whose title is empty by its UAL", () => {
    expect(
      ratedNotice({ state: "fulfilled", score: 64 }, { ...paper, title: "" }, undefined).title,
    ).toBe(TARGET);
  });
});

describe("delayedNotice", () => {
  const paper = { requestId: REQUEST_ID, targetUal: TARGET, cid: CID, title: "RNAi therapies" };
  const CANCEL_BY = new Date("2026-10-26T14:02:00Z");
  const NOW = new Date("2026-10-26T10:00:00Z");
  const PENDING = "Still pending: retried automatically about every 4 hours";

  it("says why the rating waits, that it is retried, when it is cancelled, the paper and its rating's link", () => {
    expect(
      delayedNotice(
        "scorer-unavailable",
        "verisci-rka-0xab gave up after 6 attempts: scorer rate-limited (HTTP 429)",
        paper,
        CANCEL_BY,
        NOW,
        SITE,
      ),
    ).toEqual({
      level: "activity",
      text: "⏳ Rating delayed",
      detail: [
        "Gemini's request limit is reached; the daily limit resets at 08:00 Paris time",
        PENDING,
        "Cancelled if not rated by 26 Oct, 15:02",
      ].join("\n"),
      title: "RNAi therapies",
      link: { label: "Open the rating", url: `${SITE}/papers/${CID}/ratings/${REQUEST_ID}` },
    });
  });

  it.each([
    ["between the clock changes", "2026-10-26T10:00:00Z", "08:00"],
    ["in winter", "2026-11-10T10:00:00Z", "09:00"],
    ["in summer", "2026-07-01T10:00:00Z", "09:00"],
    ["at Pacific midnight itself", "2026-11-10T08:00:00Z", "09:00"],
  ])("gives Gemini's next reset, midnight in California, in Paris time %s", (_, now, reset) => {
    const notice = delayedNotice(
      "scorer-unavailable",
      "scorer rate-limited (HTTP 429)",
      paper,
      CANCEL_BY,
      new Date(now),
      SITE,
    );

    expect(notice.detail?.split("\n")[0]).toBe(
      `Gemini's request limit is reached; the daily limit resets at ${reset} Paris time`,
    );
  });

  it.each([
    ["scorer-unavailable", "scorer unreachable (HTTP 503)", "Gemini is not answering"],
    [
      "paper-unreachable",
      "the PDF bafy did not come (HTTP 504)",
      "The IPFS gateway is not giving the paper's PDF",
    ],
    [
      "paper-unreadable",
      "bafy did not read as a PDF",
      "The IPFS gateway gave a file that did not read as a PDF",
    ],
    ["chain-unreachable", "request 0xab: chain unreachable", "The chain is not answering"],
    ["node-unreachable", "unreachable", "LabsTrail's DKG node is not answering"],
    ["mint-not-confirmed", "mint not seen", "The rating's mint on the DKG was not confirmed"],
    [
      "oracle-failed",
      "oracle-failed:oracle-stuck: x",
      "The oracle could not record the result on the chain",
    ],
  ] as const)("says in plain words why %s delays the rating", (failure, detail, line) => {
    const notice = delayedNotice(failure, detail, paper, CANCEL_BY, NOW, SITE);

    expect(notice.detail?.split("\n")[0]).toBe(line);
  });

  it("names a paper the run never read by its UAL, with no link", () => {
    expect(
      delayedNotice(
        "node-unreachable",
        "unreachable",
        { requestId: REQUEST_ID, targetUal: TARGET },
        CANCEL_BY,
        NOW,
        SITE,
      ),
    ).toEqual({
      level: "activity",
      text: "⏳ Rating delayed",
      detail: `LabsTrail's DKG node is not answering\n${PENDING}\nCancelled if not rated by 26 Oct, 15:02`,
      title: TARGET,
    });
  });

  it("names the request by its id, with no cancel time, when the run could not read it", () => {
    expect(
      delayedNotice(
        "chain-unreachable",
        "chain unreachable",
        { requestId: REQUEST_ID },
        undefined,
        NOW,
        SITE,
      ),
    ).toEqual({
      level: "activity",
      text: "⏳ Rating delayed",
      detail: `The chain is not answering\n${PENDING}`,
      title: `Request ${REQUEST_ID}`,
    });
  });
});
