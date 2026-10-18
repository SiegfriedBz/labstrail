/**
 * The site's name, what it is for and who builds it, in one place: the page metadata, the
 * structured data, the share images, the footer and the wallet window's metadata all read it.
 * The field is ADR 0037's. Plain data, so the wallet's client component can import it too.
 */
export const SITE = {
  name: "VeriSci",
  /** The home page's title, which says what VeriSci is; other pages are "<title> · VeriSci". */
  title: "VeriSci: reproducibility ratings for life-science papers",
  description:
    "VeriSci publishes life-science and health papers on the OriginTrail DKG, signed by their submitter, and rates whether each gives what others need to reproduce it.",
  /** One sentence that defines VeriSci, which the home page and the share card open with. */
  definition:
    "VeriSci is an open registry of life-science and health papers: each is signed by its submitter, anchored on Base through the OriginTrail DKG, and rated for how completely it reports what others need to repeat its work.",
  repo: "https://github.com/SiegfriedBz/verisci",
  maintainer: {
    name: "Siegfried Bozza",
    linkedIn: "https://www.linkedin.com/in/siegfriedbozza",
  },
} as const;
