/**
 * The site's name, what it is for and who builds it, in one place: the page metadata, the
 * structured data, the share images, the footer and the wallet window's metadata all read it.
 * The field is ADR 0037's. Plain data, so the wallet's client component can import it too.
 */
export const SITE = {
  name: "VeriSci",
  /** The home page's title, which says what VeriSci is; other pages are "<title> · VeriSci". */
  title: "VeriSci: open quality ratings for life-science papers",
  description:
    "Open quality ratings for life-science and health papers, from a machine reproducibility score to transparent human review, with each paper and rating recorded off-chain and on-chain.",
  /** One sentence that defines VeriSci, which the home page and the share card open with. */
  definition:
    "VeriSci is an open registry that rates the quality of life-science papers, recording each paper and each of its ratings off-chain on the OriginTrail DKG and on-chain on Base.",
  repo: "https://github.com/SiegfriedBz/verisci",
  maintainer: {
    name: "Siegfried Bozza",
    linkedIn: "https://www.linkedin.com/in/siegfriedbozza",
  },
} as const;
