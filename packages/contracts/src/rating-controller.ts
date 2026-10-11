import { encodeFunctionData, type Hex, type PublicClient } from "viem";
import { ratingControllerAbi } from "./generated/rating-controller-abi.ts";

/** What these reads need from a viem public client. */
export type ContractReader = Pick<PublicClient, "readContract">;

/** Where a request is in its life (`IRatingController.Status`). */
export type RequestStatus = "none" | "pending" | "fulfilled" | "cancelled";

/** Why a request was cancelled (`IRatingController.CancelReason`), `none` until then. */
export type CancelReason = "none" | "expired" | "invalid-target";

/** A rating request as the contract holds it (`IRatingController.RatingRequest`). */
export interface RatingRequestState {
  /** `none` for an id the contract never issued. */
  readonly status: RequestStatus;
  readonly cancelReason: CancelReason;
  /** The requester's lowercase address. */
  readonly requester: string;
  /** The request's block timestamp, in Unix seconds. */
  readonly requestedAt: number;
  /** The phase-1 score, 0 until fulfilled. */
  readonly score: number;
  readonly targetUal: string;
  /** The R-KA's UAL, empty until fulfilled. */
  readonly rKaUal: string;
}

/** The result of {@link readRatingRequest}. */
export type ReadRequestResult =
  | { readonly ok: true; readonly request: RatingRequestState }
  | { readonly ok: false; readonly reason: "unreachable" };

/** The result of {@link readOracleAgent}. */
export type ReadOracleResult =
  | { readonly ok: true; readonly oracle: string }
  | { readonly ok: false; readonly reason: "unreachable" };

const STATUSES: readonly RequestStatus[] = ["none", "pending", "fulfilled", "cancelled"];
const CANCEL_REASONS: readonly CancelReason[] = ["none", "expired", "invalid-target"];

/**
 * Reads a request from a RatingController (`getRatingRequest`). An RPC error or timeout, or a
 * reply that does not decode to a status and reason the contract writes, is `unreachable`.
 */
export async function readRatingRequest(
  client: ContractReader,
  contract: Hex,
  requestId: Hex,
): Promise<ReadRequestResult> {
  try {
    const request = await client.readContract({
      address: contract,
      abi: ratingControllerAbi,
      functionName: "getRatingRequest",
      args: [requestId],
    });
    const status = STATUSES[request.status];
    const cancelReason = CANCEL_REASONS[request.cancelReason];
    if (!status || !cancelReason) return { ok: false, reason: "unreachable" };
    return {
      ok: true,
      request: {
        status,
        cancelReason,
        requester: request.requester.toLowerCase(),
        requestedAt: Number(request.requestedAt),
        score: request.phase1Score,
        targetUal: request.targetUal,
        rKaUal: request.rKaUal,
      },
    };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Reads the address allowed to fulfil and cancel on a RatingController, in lowercase. */
export async function readOracleAgent(
  client: ContractReader,
  contract: Hex,
): Promise<ReadOracleResult> {
  try {
    const oracle = await client.readContract({
      address: contract,
      abi: ratingControllerAbi,
      functionName: "oracleAgent",
    });
    return { ok: true, oracle: oracle.toLowerCase() };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** The calldata of `fulfilPhase1(requestId, score, rKaUal)`, for the oracle to send. */
export function fulfilCalldata(requestId: Hex, score: number, rKaUal: string): Hex {
  return encodeFunctionData({
    abi: ratingControllerAbi,
    functionName: "fulfilPhase1",
    args: [requestId, score, rKaUal],
  });
}

/** The calldata of `cancelRequest(requestId, reason)`: `Expired` is 1, `InvalidTarget` 2. */
export function cancelCalldata(requestId: Hex, reason: "expired" | "invalid-target"): Hex {
  return encodeFunctionData({
    abi: ratingControllerAbi,
    functionName: "cancelRequest",
    args: [requestId, CANCEL_REASONS.indexOf(reason)],
  });
}
