import { Analytics } from "@vercel/analytics/next";
import type { WebEnv } from "../../lib/web-env.ts";

/**
 * Vercel Web Analytics on production only (ADR 0041): page views with their page, referrer,
 * country, device and browser, without cookies. Staging, previews and local runs count nothing.
 */
export function SiteAnalytics({ appEnv }: { appEnv: WebEnv["APP_ENV"] }) {
  return appEnv === "production" ? <Analytics /> : null;
}
