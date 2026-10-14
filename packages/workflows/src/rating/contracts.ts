import { ratingControllerDeployments } from "@verisci/contracts";
import type { SharedEnv } from "@verisci/env";

/**
 * The contracts an environment takes and reads rating requests from, lowercase: locally the
 * one deployed on Anvil (ADR 0036), elsewhere every contract of the environment, current and
 * past (ADRs 0023, 0028).
 */
export function environmentContracts(
  appEnv: SharedEnv["APP_ENV"],
  localContract: string | undefined,
): string[] {
  if (appEnv === "local") return [String(localContract).toLowerCase()];
  const { current, past } = ratingControllerDeployments(appEnv);
  return [current, ...past].map((deployment) => deployment.address);
}
