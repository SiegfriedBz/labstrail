import type { MetadataRoute } from "next";
import { robotsFor } from "../lib/seo/crawl.ts";
import { createWebEnv } from "../lib/web-env.ts";

/** `/robots.txt`: open on production, closed elsewhere (`robotsFor`, ADR 0040). */
export default function robots(): MetadataRoute.Robots {
  return robotsFor(createWebEnv());
}
