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
