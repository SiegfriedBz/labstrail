import type { Metadata } from "next";

/**
 * The site's name and what it is for, in one place: the page metadata, the footer and the
 * wallet window's metadata all read it. The field is ADR 0037's.
 */
export const SITE = {
  name: "VeriSci",
  description:
    "VeriSci publishes life-science and health papers on the OriginTrail DKG, signed by their submitter, and will rate whether each gives what others need to reproduce it.",
} as const;

/** The layout's metadata: the title, the description, Open Graph and the Twitter card. */
export const siteMetadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
  openGraph: {
    title: SITE.name,
    description: SITE.description,
    siteName: SITE.name,
    type: "website",
  },
  twitter: { card: "summary", title: SITE.name, description: SITE.description },
};
