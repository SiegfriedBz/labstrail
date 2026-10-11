import { ratingControllerDeployments } from "@verisci/contracts";
import { createDkgClient } from "@verisci/dkg";
import { type RuntimeEnv, sharedEnv } from "@verisci/env";
import { createPublicClient, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, baseSepolia } from "viem/chains";
import { inngest } from "./inngest.ts";
import { createPublishPaper, PUBLISH_SETTINGS, type PublishDeps } from "./publish/publish-paper.ts";
import { readPaper } from "./publish/read-paper.ts";
import { verifySubmission } from "./publish/verify-submission.ts";
import { createOracleTransaction, ORACLE_SETTINGS, type OracleChain } from "./rating/oracle.ts";
import { createOracleChain } from "./rating/oracle-chain.ts";
import { readPaperText } from "./rating/paper-text.ts";
import { createRatePaper, RATING_SETTINGS, type RatingDeps } from "./rating/rate-paper.ts";
import { classifyPaper, judgePaper } from "./rating/scorer.ts";
import { createRatingEnv, type RatingEnv, servesRating } from "./rating-env.ts";
import { createWorkflowsEnv } from "./workflows-env.ts";

/** How long the gateway and GROBID each get, inside the 300 s a step may take on Vercel. */
const IO_TIMEOUT_MS = 60_000;

let publishDeps: PublishDeps | undefined;

/** The publish run's adapters, built from the validated settings on the first run. */
function getPublishDeps(): PublishDeps {
  if (publishDeps) return publishDeps;
  const env = createWorkflowsEnv();
  const client = createPublicClient({ chain: baseSepolia, transport: http(env.CHAIN_RPC_URL) });
  const paperOptions = {
    gatewayUrl: env.PINATA_GATEWAY_URL,
    grobidUrl: env.GROBID_URL,
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
    maxBytes: PUBLISH_SETTINGS.maxPdfBytes,
    timeoutMs: IO_TIMEOUT_MS,
  };
  publishDeps = {
    verifySubmission: (data, receivedAt) =>
      verifySubmission(data, {
        contextGraph: env.DKG_CONTEXT_GRAPH,
        client,
        now: () => receivedAt,
      }),
    readPaper: (cid) => readPaper(cid, paperOptions),
    dkg: createDkgClient({
      url: env.DKG_URL,
      token: env.DKG_TOKEN,
      contextGraphId: env.DKG_CONTEXT_GRAPH,
    }),
  };
  return publishDeps;
}

interface RatingChain {
  readonly env: RatingEnv;
  readonly chain: OracleChain;
  readonly chainId: number;
  /** The environment's contracts, lowercase. */
  readonly contracts: readonly string[];
}

let ratingChain: RatingChain | undefined;

/**
 * The rating settings and the oracle's chain, built once. Locally the contract is the one
 * deployed on Anvil (ADR 0036); elsewhere every contract of the environment, current and past,
 * on Base Sepolia (ADRs 0023, 0028).
 */
function getRatingChain(): RatingChain {
  if (ratingChain) return ratingChain;
  const env = createRatingEnv();
  const local = env.APP_ENV === "local";
  const chain = local ? anvil : baseSepolia;
  // One try per call, so a call ends within its timeout: the steps poll and retry.
  const transport = http(local ? env.LOCAL_CHAIN_RPC_URL : env.CHAIN_RPC_URL, {
    timeout: ORACLE_SETTINGS.rpcTimeoutMs,
    retryCount: 0,
  });
  const account = privateKeyToAccount(env.ORACLE_PRIVATE_KEY as Hex);
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  ratingChain = {
    env,
    // Base's OP-stack formatters type its client apart from viem's default `PublicClient`;
    // the reads the oracle makes (nonces, fees, receipts, contract calls) are the same.
    chain: createOracleChain({ client: client as never, wallet, account }),
    chainId: chain.id,
    contracts: environmentContracts(env),
  };
  return ratingChain;
}

/** The contracts a rating run takes requests from, lowercase. */
function environmentContracts(env: RatingEnv): string[] {
  if (env.APP_ENV === "local") return [String(env.LOCAL_RATING_CONTRACT).toLowerCase()];
  const { current, past } = ratingControllerDeployments(env.APP_ENV);
  return [current, ...past].map((deployment) => deployment.address);
}

let ratingDeps: RatingDeps | undefined;

/** The rating run's adapters, built from the validated settings on the first run. */
function getRatingDeps(): RatingDeps {
  if (ratingDeps) return ratingDeps;
  const { env, chain, chainId, contracts } = getRatingChain();
  const gemini = {
    apiKey: env.GEMINI_API_KEY,
    model: RATING_SETTINGS.model,
    fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
  };
  ratingDeps = {
    contracts,
    oracle: chain.account,
    contextGraph: env.DKG_CONTEXT_GRAPH,
    chainId,
    now: () => Date.now(),
    readRequest: chain.readRequest,
    readOracle: chain.readOracle,
    dkg: createDkgClient({
      url: env.DKG_URL,
      token: env.DKG_TOKEN,
      contextGraphId: env.DKG_CONTEXT_GRAPH,
    }),
    readPaper: (cid) =>
      readPaperText(cid, {
        gatewayUrl: env.PINATA_GATEWAY_URL,
        fetch: (input: string | URL | Request, init?: RequestInit) => fetch(input, init),
        maxBytes: RATING_SETTINGS.maxPdfBytes,
        timeoutMs: RATING_SETTINGS.pdfTimeoutMs,
        maxChars: RATING_SETTINGS.maxTextChars,
      }),
    classify: (paper) =>
      classifyPaper(paper, { ...gemini, timeoutMs: RATING_SETTINGS.classifierTimeoutMs }),
    judge: (paper, type) =>
      judgePaper(paper, type, { ...gemini, timeoutMs: RATING_SETTINGS.judgeTimeoutMs }),
  };
  return ratingDeps;
}

/** Publishes a submitted PDF as a Target KA (`verisci/paper.submitted`). */
export const publishPaper = createPublishPaper(inngest, getPublishDeps);

/** Sends the oracle's fulfil and cancel transactions, one at a time (ADR 0019). */
export const oracleTransaction = createOracleTransaction(inngest, () => getRatingChain().chain);

/** Rates a requested paper and has the oracle record it (`verisci/rating.requested`). */
export const ratePaper = createRatePaper(inngest, getRatingDeps, oracleTransaction, {
  throttle: sharedEnv.APP_ENV !== "local",
});

/**
 * The functions a deployment serves: the publish function, plus the rating and oracle
 * functions where the oracle key is set (ADR 0019). Reads the key's presence only.
 */
export function servedFunctions(runtimeEnv: RuntimeEnv = process.env) {
  return servesRating(runtimeEnv) ? [publishPaper, ratePaper, oracleTransaction] : [publishPaper];
}

/** Every Inngest function this deployment serves, for `web`'s `/api/inngest` route (ADR 0003). */
export const functions = servedFunctions();
