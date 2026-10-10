/*
 * The paper page's panel headings and field labels, shared with its skeleton so the skeleton
 * shows the real ones and only the values load. A plain module: strings exported from a
 * "use client" file would reach server components as client references, not text.
 */

/** The published paper's panel (`VerifyPanel`). */
export const VERIFY_TITLE = "Verify it yourself";
export const VERIFY_INTRO = "These values are public. You can check each one without trusting us.";

/** `VerifyPanel`'s fields, in the order it shows them. */
export const VERIFY_LABELS = {
  submitter: "Submitted by",
  signature: "Submitter's signature",
  deadline: "Signed deadline (Unix seconds)",
  contextGraph: "Context graph",
  publisher: "Minted to VeriSci's node",
  token: "Asset token (ERC-721, OriginTrail's DKGKnowledgeAssets)",
  ual: "Knowledge Asset (UAL)",
  pdf: "PDF (CID)",
} as const;

/** The panel beside a paper being published (`PaperProgress`). */
export const PUBLISH_PANEL_TITLE = "What's happening now";
export const PUBLISH_PANEL_LABELS = {
  ual: VERIFY_LABELS.ual,
  pdf: VERIFY_LABELS.pdf,
  ipfs: "IPFS link",
} as const;
