import type { MetadataRoute } from "next";
import { robotsFor } from "../lib/seo/crawl.ts";
import { createWebEnv } from "../lib/web-env.ts";

/**
 * Rendered on request, so a build reads no settings (ADR 0004); Next would otherwise render it
 * once at build.
 */
export const dynamic = "force-dynamic";

/** `/robots.txt`: open on production, closed elsewhere (`robotsFor`, ADR 0040). */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(createWebEnv());
}
