/** The settings {@link siteUrlOf} reads: Vercel sets the two URLs on its deployments. */
export interface SiteEnv {
  readonly APP_ENV: string;
  readonly VERCEL_PROJECT_PRODUCTION_URL?: string | undefined;
  readonly VERCEL_BRANCH_URL?: string | undefined;
}

/**
 * The site's address, for the links in activity messages: production's domain, the `develop`
 * branch's URL on staging, `http://localhost:3000` locally; `undefined` when Vercel gave none.
 */
export function siteUrlOf(env: SiteEnv): string | undefined {
  if (env.APP_ENV === "local") return "http://localhost:3000";
  const host =
    env.APP_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_BRANCH_URL;
  return host ? `https://${host}` : undefined;
}

const link = (siteUrl: string | undefined, path: string | undefined) =>
  siteUrl && path ? `\n${siteUrl}${path}` : "";

/** The activity message for a paper this run minted: its title, or its CID, and its page. */
export function publishedText(
  paper: { readonly cid: string; readonly title?: string | undefined },
  siteUrl: string | undefined,
): string {
  return `Published: ${paper.title ?? paper.cid}${link(siteUrl, `/papers/${paper.cid}`)}`;
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
 * The activity message for a rating the oracle settled: the score out of 100, or why it was
 * cancelled, the paper by its title or UAL, and the rating's page when the paper was found.
 */
export function ratedText(
  outcome:
    | { readonly state: "fulfilled"; readonly score: number }
    | { readonly state: "cancelled"; readonly reason: "expired" | "invalid-target" },
  paper: RatedPaper,
  siteUrl: string | undefined,
): string {
  const name = paper.title ?? paper.targetUal;
  const page = paper.cid ? `/papers/${paper.cid}/ratings/${paper.requestId}` : undefined;
  const what =
    outcome.state === "fulfilled"
      ? `Rated ${outcome.score}/100`
      : `Rating cancelled, ${outcome.reason === "expired" ? "not finished within a day" : "can't be rated"}`;
  return `${what}: ${name}${link(siteUrl, page)}`;
}
