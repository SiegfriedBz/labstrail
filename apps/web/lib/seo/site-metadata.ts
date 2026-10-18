import { siteUrlOf } from "@verisci/workflows";
import type { Metadata } from "next";
import { SITE } from "../site.ts";
import type { WebEnv } from "../web-env.ts";

/** Where the site runs when Vercel gave no address: the dev server. */
const LOCAL_URL = "http://localhost:3000";

/**
 * The site's address, which its canonical links, sitemap and structured data are absolute
 * against: production's domain, the branch's URL on staging, the dev server locally
 * (`siteUrlOf`, the address notifications link to).
 */
export function siteUrl(env: WebEnv): string {
  return siteUrlOf(env) ?? LOCAL_URL;
}

/**
 * The layout's metadata: the site's address as every link's base, the home page's title and
 * the template other pages' titles fill, each page's own path as its canonical (`"./"` drops
 * the query), the description, Open Graph and a large Twitter card (both show
 * `app/opengraph-image.tsx`). Crawlers may index production only (ADR 0040).
 */
export function siteMetadata(env: WebEnv): Metadata {
  return {
    metadataBase: new URL(siteUrl(env)),
    title: { default: SITE.title, template: `%s · ${SITE.name}` },
    description: SITE.description,
    alternates: { canonical: "./" },
    openGraph: {
      title: SITE.title,
      description: SITE.description,
      siteName: SITE.name,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
    ...(env.APP_ENV === "production" ? {} : { robots: { index: false, follow: false } }),
  };
}
