import { dkgSchema } from "@verisci/dkg";
import { createSharedEnv, defineEnv, type RuntimeEnv, type SharedEnv } from "@verisci/env";
import { z } from "zod";

/** The Pinata API key (JWT) that signs uploads, lists and unpins files. Secret. */
export const pinataSchema = { PINATA_JWT: z.string().min(1) };

/**
 * The Gemini key, read by the publish run's field check (ADR 0037), the rating functions'
 * scorer (ADR 0018) and the `score-papers` dev script. Secret.
 */
export const geminiSchema = {
  GEMINI_API_KEY: z.string().min(1),
};

/**
 * Validates the workflows' settings from `runtimeEnv` (default `process.env`): GROBID, the
 * Pinata gateway and key, the Gemini key, a Base Sepolia RPC URL, and Inngest's event and signing keys
 * outside `local` (the dev server needs none), plus the DKG node's (`dkgSchema`, in the
 * same pass, with the context graph's address in the node's checksum case) and the shared
 * ones. The Inngest SDK reads its keys itself; they are checked
 * here so a deployed server stops at start without them, and the signing key also reads
 * runs. Throws one `EnvError` naming every bad variable, never its value.
 * `@verisci/workflows/env` builds it once from `process.env`; the functions build it on
 * their first run, and tests call this with their own object.
 */
export function createWorkflowsEnv(runtimeEnv: RuntimeEnv = process.env) {
  const shared = createSharedEnv(runtimeEnv);
  return defineEnv({ extends: [shared], server: workflowsSchema(shared.APP_ENV), runtimeEnv });
}

/**
 * The workflows' variables and their rules for `appEnv`, the DKG node's included, for an env
 * module that validates them with its own in one `defineEnv` (the rating settings).
 */
export function workflowsSchema(appEnv: SharedEnv["APP_ENV"]) {
  const inngestKey = appEnv === "local" ? z.string().min(1).optional() : z.string().min(1);
  return {
    ...dkgSchema(appEnv === "production"),
    GROBID_URL: z.url(),
    PINATA_GATEWAY_URL: z.url(),
    CHAIN_RPC_URL: z.url(),
    ...pinataSchema,
    ...geminiSchema,
    INNGEST_EVENT_KEY: inngestKey,
    INNGEST_SIGNING_KEY: inngestKey,
    /** Set by Vercel: the branch, which names a staging deployment's Inngest environment. */
    VERCEL_GIT_COMMIT_REF: z.string().optional(),
  };
}

/** The validated workflows settings, the DKG node's and the shared ones included. */
export type WorkflowsEnv = ReturnType<typeof createWorkflowsEnv>;
