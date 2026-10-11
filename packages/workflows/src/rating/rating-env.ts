import { createSharedEnv, defineEnv, type RuntimeEnv, type SharedEnv } from "@verisci/env";
import { z } from "zod";
import { workflowsSchema } from "../workflows-env.ts";

/**
 * The local chain's variables (ADR 0036): Anvil's URL and the RatingController deployed there.
 * Read only when `APP_ENV=local`, by the rating functions and the `rate-paper` dev script.
 */
export const localChainSchema = {
  LOCAL_CHAIN_RPC_URL: z.url(),
  LOCAL_RATING_CONTRACT: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address"),
};

/**
 * The rating functions' own variables for `appEnv`: the oracle's key (ADR 0019) and the
 * Gemini key (ADR 0018), and locally Anvil's URL and the contract deployed there (ADR 0036),
 * which other environments never read. Messages never include a value.
 */
export function ratingSchema(appEnv: SharedEnv["APP_ENV"]) {
  const local = appEnv === "local";
  return {
    ORACLE_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be 0x and 64 hex digits"),
    GEMINI_API_KEY: z.string().min(1),
    LOCAL_CHAIN_RPC_URL: local ? localChainSchema.LOCAL_CHAIN_RPC_URL : z.string().optional(),
    LOCAL_RATING_CONTRACT: local ? localChainSchema.LOCAL_RATING_CONTRACT : z.string().optional(),
  };
}

/**
 * Validates the rating functions' settings from `runtimeEnv` (default `process.env`), with the
 * workflows' and shared ones in the same pass, so one `EnvError` names every bad variable,
 * never its value. The rating functions build it on their first run; a deployed server checks
 * it at start when {@link ratingSettingsRequired}.
 */
export function createRatingEnv(runtimeEnv: RuntimeEnv = process.env) {
  const shared = createSharedEnv(runtimeEnv);
  return defineEnv({
    extends: [shared],
    server: { ...workflowsSchema(shared.APP_ENV), ...ratingSchema(shared.APP_ENV) },
    runtimeEnv,
  });
}

/** The validated rating settings, the workflows', DKG node's and shared ones included. */
export type RatingEnv = ReturnType<typeof createRatingEnv>;

/**
 * True when this deployment serves the rating and oracle functions: only where the oracle key
 * is set, `develop` and production on Vercel (ADR 0019). Reads presence only, so serving the
 * functions validates nothing.
 */
export function servesRating(runtimeEnv: RuntimeEnv = process.env): boolean {
  return Boolean(runtimeEnv.ORACLE_PRIVATE_KEY);
}

/**
 * True when a deployed server must check the rating settings at start: always in production,
 * which refuses to start without its oracle key (ADR 0019), and on staging when the key is set.
 * Never locally, where a server checks no setting at start (ADR 0004).
 */
export function ratingSettingsRequired(runtimeEnv: RuntimeEnv): boolean {
  const appEnv = runtimeEnv.APP_ENV ?? "local";
  if (appEnv === "local") return false;
  return appEnv === "production" || servesRating(runtimeEnv);
}

/**
 * Checks the rating settings where {@link ratingSettingsRequired}, for a deployed server's
 * start check; throws `EnvError` naming each bad one.
 */
export function checkRatingSettings(runtimeEnv: RuntimeEnv): void {
  if (ratingSettingsRequired(runtimeEnv)) createRatingEnv(runtimeEnv);
}
