import { getUploadService } from "@verisci/workflows";
import type { MetadataRoute } from "next";
import { sitemapFor } from "../lib/seo/crawl.ts";
import { createWebEnv } from "../lib/web-env.ts";

/** Read again at most hourly, so a crawl does not ask the node and the chain each time. */
export const revalidate = 3600;

/** `/sitemap.xml`: the site's pages and every published paper on production (`sitemapFor`). */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapFor(createWebEnv(), {
    listPapers: (options) => getUploadService().listPapers(options),
    logger: console,
  });
}
