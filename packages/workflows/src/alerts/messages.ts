import type { DelayedFailure } from "../rating/rate-paper.ts";
import { RECONCILER_SETTINGS } from "../rating/reconciler.ts";
import type { Notice } from "./notify.ts";

/** The settings {@link siteUrlOf} reads: Vercel sets the two URLs on its deployments. */
export interface SiteEnv {
  readonly APP_ENV: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  readonly VERCEL_BRANCH_URL?: string | undefined;
}

/**
 * The site's address, for the links in activity messages and, through the web app, its
 * canonical links, sitemap and structured data: production's domain, the `develop` branch's
 * URL on staging, `http://localhost:3000` locally; `undefined` when Vercel gave none.
 */
export function siteUrlOf(env: SiteEnv): string | undefined {
  if (env.APP_ENV === "local") return "http://localhost:3000";
  const host =
    env.APP_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_BRANCH_URL;
  return host ? `https://${host}` : undefined;
}

const link = (siteUrl: string | undefined, path: string | undefined, label: string) =>
  siteUrl && path ? { label, url: `${siteUrl}${path}` } : undefined;

/**
 * The activity message for a paper this run minted: `📄 Published`, its title (its CID when
 * it has none) and a link to its page.
 */
export function publishedNotice(
  paper: { readonly cid: string; readonly title?: string | undefined },
  siteUrl: string | undefined,
): Notice {
  return {
    level: "activity",
    text: "📄 Published",
    title: paper.title || paper.cid,
    link: link(siteUrl, `/papers/${paper.cid}`, "Open the paper"),
  };
}

/** What a settled rating needs from its run to be named. */
export interface RatedPaper {
  readonly requestId: string;
  readonly targetUal: string;
  /** Known once the run found the paper's PDF; the rating's page lives under it. */
  readonly cid?: string | undefined;
  readonly title?: string | undefined;
}

/**
 * The activity message for a rating the oracle settled: `⭐ Rated <score>/100`, or
 * `⚠️ Rating cancelled` and why, the paper by its title (its UAL when it has none), and a link
 * to the rating's page when the paper was found.
 */
export function ratedNotice(
  outcome:
    | { readonly state: "fulfilled"; readonly score: number }
    | { readonly state: "cancelled"; readonly reason: "expired" | "invalid-target" },
  paper: RatedPaper,
  siteUrl: string | undefined,
): Notice {
  const page = paper.cid ? `/papers/${paper.cid}/ratings/${paper.requestId}` : undefined;
  const text =
    outcome.state === "fulfilled"
      ? `⭐ Rated ${outcome.score}/100`
      : `⚠️ Rating cancelled: ${outcome.reason === "expired" ? "not finished within a day" : "can't be rated"}`;
  return {
    level: "activity",
    text,
    title: paper.title || paper.targetUal,
    link: link(siteUrl, page, "Open the rating"),
  };
}

/** The time zone the maintainer reads a message's times in. */
const MAINTAINER_TIME_ZONE = "Europe/Paris";

/** Gemini's free tier counts its daily requests from midnight Pacific time (`docs/domain.md` → Gemini). */
const GEMINI_QUOTA_TIME_ZONE = "America/Los_Angeles";

/** The paper a delayed rating is for, as far as its run read it: none of it but the request id when the chain never gave the request. */
export interface DelayedPaper {
  readonly requestId: string;
  readonly targetUal?: string | undefined;
  /** Known once the run found the paper's PDF; the rating's page lives under it. */
  readonly cid?: string | undefined;
  readonly title?: string | undefined;
}

/** Why each delayed failure but the scorer's holds a rating up, in plain words. */
const DELAY_REASONS: Record<Exclude<DelayedFailure, "scorer-unavailable">, string> = {
  "paper-unreachable": "The IPFS gateway is not giving the paper's PDF",
  "paper-unreadable": "The IPFS gateway gave a file that did not read as a PDF",
  "chain-unreachable": "The chain is not answering",
  "node-unreachable": "LabsTrail's DKG node is not answering",
  "mint-not-confirmed": "The rating's mint on the DKG was not confirmed",
  "oracle-failed": "The oracle could not record the result on the chain",
};

/**
 * The activity message for a rating run that gave up while its request stays pending (ADR
 * 0038): `⏳ Rating delayed`, then why in plain words (from `failure`, and for the scorer from
 * the error's `detail`: a 429 is Gemini's daily limit, given with its next reset in Paris
 * time), that the reconciler retries it, and `cancelBy` in Paris time when the run read the
 * request, or that the next retry cancels it once `cancelBy` is past; then the paper by its title (its UAL, else its request id) and a link to the
 * rating's page when the run found the paper's PDF.
 */
export function delayedNotice(
  failure: DelayedFailure,
  detail: string,
  paper: DelayedPaper,
  cancelBy: Date | undefined,
  now: Date,
  siteUrl: string | undefined,
): Notice {
  const hours = Math.round(RECONCILER_SETTINGS.thresholdMs / 3_600_000);
  const lines = [
    failure === "scorer-unavailable" ? scorerReason(detail, now) : DELAY_REASONS[failure],
    ...(cancelBy && cancelBy <= now
      ? ["Past its maximum age: cancelled at the next retry"]
      : [
          `Still pending: retried automatically about every ${hours} hours`,
          ...(cancelBy ? [`Cancelled if not rated by ${DAY_AND_TIME.format(cancelBy)}`] : []),
        ]),
  ];
  const page = paper.cid ? `/papers/${paper.cid}/ratings/${paper.requestId}` : undefined;
  return {
    level: "activity",
    text: "⏳ Rating delayed",
    detail: lines.join("\n"),
    title: paper.title || paper.targetUal || `Request ${paper.requestId}`,
    link: link(siteUrl, page, "Open the rating"),
  };
}

const DAY_AND_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: MAINTAINER_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: MAINTAINER_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Gemini's reason: its daily limit, with its next reset, for a 429; otherwise not answering. */
function scorerReason(detail: string, now: Date): string {
  if (!/rate-limited|HTTP 429/.test(detail)) return "Gemini is not answering";
  const reset = TIME.format(nextMidnight(now, GEMINI_QUOTA_TIME_ZONE));
  return `Gemini's request limit is reached; the daily limit resets at ${reset} Paris time`;
}

/**
 * The first midnight in `timeZone` after `now`, its offset read again at that midnight so a
 * clock change that day is counted.
 */
function nextMidnight(now: Date, timeZone: string): Date {
  const { year, month, day, offsetMs } = zoned(now, timeZone);
  const wall = Date.UTC(year, month - 1, day + 1);
  return new Date(wall - zoned(new Date(wall - offsetMs), timeZone).offsetMs);
}

/** `at`'s date in `timeZone`, and that zone's offset from UTC at that instant. */
function zoned(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((found) => found.type === type)?.value ?? "";
  const [, sign, hours, minutes] = /GMT([+-])(\d+):(\d+)/.exec(part("timeZoneName")) ?? [];
  const offsetMinutes = sign ? Number(hours) * 60 + Number(minutes) : 0;
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    offsetMs: (sign === "-" ? -1 : 1) * offsetMinutes * 60_000,
  };
}
