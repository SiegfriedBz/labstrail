import { BASE_SEPOLIA_CHAIN_ID } from "../assets/chains.ts";

/**
 * The largest PDF LabsTrail publishes and rates: 15 MB. A paper published before the limit was
 * lowered from 30 MB, and over it, is cancelled when someone asks to rate it (ADR 0011). The
 * scorer's reference papers weigh 0.4 to 12.4 MB.
 */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** What a submitter signs to publish a PDF (ADR 0010). */
export interface SubmissionMessage {
  /** The PDF's CID, canonical CIDv1 base32 (as in its Target KA name). */
  readonly cid: string;
  /**
   * The full context graph id the paper is published to, so a signature serves one
   * environment. Signed with its address in lowercase, whatever the casing given.
   */
  readonly contextGraph: string;
  /** Unix seconds after which the signature is refused. */
  readonly deadline: bigint;
}

/**
 * LabsTrail's EIP-712 domain: no `verifyingContract`, since a submission calls no contract
 * (ADR 0010).
 */
export const SUBMISSION_DOMAIN = {
  name: "labstrail",
  version: "1",
  chainId: BASE_SEPOLIA_CHAIN_ID,
} as const;

/**
 * The domain papers published before the rename were signed under (ADR 0042). Their
 * signatures still check under it; new submissions sign under {@link SUBMISSION_DOMAIN}.
 */
export const PRE_RENAME_DOMAIN = { ...SUBMISSION_DOMAIN, name: "verisci" } as const;

/** An EIP-712 domain a submission is signed under. */
export type SubmissionDomain = typeof SUBMISSION_DOMAIN | typeof PRE_RENAME_DOMAIN;

const SUBMISSION_TYPES = {
  Submission: [
    { name: "cid", type: "string" },
    { name: "contextGraph", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * The EIP-712 typed data a submitter signs for `message`, in the shape viem's
 * `signTypedData` and `verifyTypedData` take, under `domain` ({@link SUBMISSION_DOMAIN}
 * unless given). The graph id's address is written in lowercase, so every casing of one
 * graph signs one message.
 */
export function submissionTypedData(
  message: SubmissionMessage,
  domain: SubmissionDomain = SUBMISSION_DOMAIN,
) {
  return {
    domain,
    types: SUBMISSION_TYPES,
    primaryType: "Submission",
    message: {
      cid: message.cid,
      contextGraph: canonicalContextGraph(message.contextGraph),
      deadline: message.deadline,
    },
  } as const;
}

/**
 * A context graph id with its agent address in lowercase and its name unchanged, the one
 * spelling a submission signs and the KA's checker uses.
 */
export function canonicalContextGraph(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? id : `${id.slice(0, slash).toLowerCase()}${id.slice(slash)}`;
}
