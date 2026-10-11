import type { RatingRequestState, ReadOracleResult, ReadRequestResult } from "@verisci/contracts";
import {
  classifyTarget,
  parseRating,
  ratingQuery,
  rKaName,
  rKaQuads,
  SCORER_PROMPT_VERSION,
  type ScorerOutput,
  type Triple,
  targetTriplesQuery,
  triplesFromBindings,
} from "@verisci/core";
import type { DkgClient, DkgFailure } from "@verisci/dkg";
import { type Inngest, type InngestFunction, NonRetriableError } from "inngest";
import type { Hex } from "viem";
import { z } from "zod";
import { RATING_REQUESTED } from "./events.ts";
import type { OracleInput, OracleLogger, OracleResult } from "./oracle.ts";
import type { ScoreResult } from "./scorer.ts";

/** The rating run's settings (ADRs 0008, 0009, 0015, 0018, 0020). */
export const RATING_SETTINGS = {
  /** The Gemini model that scores, on the free tier (ADR 0018). */
  model: "gemini-3.8-flash",
  /** Most triples of a target the scorer reads (ADR 0018). */
  maxTriples: 200,
  /** How long Gemini gets for one score. */
  scorerTimeoutMs: 60_000,
  /**
   * Past this, a request is fulfilled only if its R-KA is minted, else cancelled (ADR 0020).
   * It must exceed the reconciler's threshold and interval plus `finishTimeout`.
   */
  maxAgeMs: 24 * 3600 * 1000,
  /** How long `startMint` listens for the node's answer. */
  listenMs: 10_000,
  pollInterval: "30s",
  /** Polls before a mint is started again: 10 minutes at 30 s. */
  pollsPerMint: 20,
  retryWait: "2m",
  attempts: 5,
  /** A run's whole budget, enforced by Inngest. */
  finishTimeout: "45m",
  /** How long the run waits for the oracle function, just over its `finishTimeout`. */
  oracleTimeout: "35m",
  /** Run starts outside `local`, sized against Inngest's free plan (ADR 0015). */
  throttle: { limit: 3, period: "1h", burst: 3 },
} as const;

/**
 * Why a rating run stopped without an outcome, carried in its error as
 * `rating-failed:<reason>: <detail>` ({@link ratingFailureReason}). `setup` and
 * `rating-unreadable` are ours to fix; the others clear up with time, and the request stays
 * pending for the next run.
 */
export type RatingFailure =
  | "chain-unreachable"
  | "node-unreachable"
  | "target-unreadable"
  | "scorer-unavailable"
  | "mint-not-confirmed"
  | "oracle-failed"
  | "rating-unreadable"
  | "setup";

const RATING_FAILURES: readonly RatingFailure[] = [
  "chain-unreachable",
  "node-unreachable",
  "target-unreadable",
  "scorer-unavailable",
  "mint-not-confirmed",
  "oracle-failed",
  "rating-unreadable",
  "setup",
];

/**
 * How a rating run ends, unless it fails: the request fulfilled or cancelled (an `orphan` is an
 * R-KA the contract never recorded, ADR 0014), skipped, or left `waiting` for its maximum age.
 */
export type RatingOutcome =
  | { readonly state: "fulfilled"; readonly score: number; readonly rKaUal: string }
  | {
      readonly state: "cancelled";
      readonly reason: "expired" | "invalid-target";
      readonly orphan?: string;
    }
  | {
      readonly state: "skipped";
      readonly reason: "bad-event" | "unknown-contract" | "not-pending" | "not-our-oracle";
    }
  | { readonly state: "waiting"; readonly reason: "target-elsewhere" };

/** The step tools a rating run uses: `step.run`, `step.sleep`, and `step.invoke` of the oracle. */
export interface RatingSteps {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleep(id: string, duration: string): Promise<void>;
  oracle(id: string, input: OracleInput): Promise<OracleResult>;
}

/** The adapters and settings a rating run uses. */
export interface RatingDeps {
  /** The environment's contracts, current and past, lowercase (ADR 0023). */
  readonly contracts: readonly string[];
  /** This deployment's oracle address, lowercase (ADR 0019). */
  readonly oracle: string;
  /** The context graph R-KAs go to, and our targets are read from. */
  readonly contextGraph: string;
  /** The chain the contracts are on, recorded with the contract in the R-KA. */
  readonly chainId: number;
  /** The current time in milliseconds. */
  now(): number;
  readRequest(contract: Hex, requestId: Hex): Promise<ReadRequestResult>;
  readOracle(contract: Hex): Promise<ReadOracleResult>;
  readonly dkg: Pick<DkgClient, "readAsset" | "storeAsset" | "startMint" | "query">;
  score(triples: readonly Triple[]): Promise<ScoreResult>;
}

const eventSchema = z.object({
  contract: z.string().regex(/^0x[0-9a-f]{40}$/),
  requestId: z.string().regex(/^0x[0-9a-f]{64}$/),
});

type ReadRequestStep =
  | {
      readonly ok: true;
      readonly request: RatingRequestState;
      readonly oracle: string;
      readonly at: number;
    }
  | { readonly ok: false };

type Attempt =
  | { readonly kind: "fulfil"; readonly score: number; readonly rKaUal: string }
  | { readonly kind: "expire"; readonly orphan?: string }
  | { readonly kind: "retry"; readonly failure: RatingFailure; readonly reason: string }
  | { readonly kind: "mint-again" }
  | { readonly kind: "fatal"; readonly failure: RatingFailure; readonly reason: string };

/** The error that stops a run, with its reason first in the message. */
function stop(reason: RatingFailure, detail: string, cause?: unknown): NonRetriableError {
  return new NonRetriableError(`rating-failed:${reason}: ${detail}`, { cause });
}

/**
 * The reason a failed run's error carries, wherever Inngest nests the error in the run's
 * output (an object, or the JSON text the dev server gives), or `undefined`.
 */
export function ratingFailureReason(output: unknown): RatingFailure | undefined {
  const text = typeof output === "string" ? output : JSON.stringify(output ?? null);
  const found = /rating-failed:([a-z-]+): /.exec(text)?.[1];
  return RATING_FAILURES.find((reason) => reason === found);
}

/**
 * Rates a phase-1 request (ADRs 0011, 0012, 0018, 0020), doing only what is left:
 *
 * 1. the request must be on one of the environment's contracts, pending, and that contract's
 *    oracle must be this deployment's key, or the run stops before spending anything;
 * 2. a target that can never be rated is cancelled `invalid-target`; one another node minted
 *    waits, since its graph is unknown;
 * 3. the R-KA is read: minted is fulfilled; stored is minted at once (ADR 0008); a draft is
 *    shared, then minted; missing is scored once, stored and minted;
 * 4. the score is always read back from the minted R-KA, so the chain records the R-KA's;
 * 5. past `maxAgeMs`, only a minted R-KA is fulfilled (a stored one is polled, never minted);
 *    anything else is cancelled `expired`.
 *
 * Fulfil and cancel go through the oracle function (ADR 0019). A failure worth a retry waits
 * `retryWait` and starts a new attempt from the R-KA's read (ADR 0009); a mint not seen after
 * `pollsPerMint` polls is started again. A score that came back is never computed again.
 */
export async function runRating(
  data: unknown,
  step: RatingSteps,
  deps: RatingDeps,
  logger: OracleLogger,
): Promise<RatingOutcome> {
  const event = eventSchema.safeParse(data);
  if (!event.success) return { state: "skipped", reason: "bad-event" };
  const contract = event.data.contract as Hex;
  const requestId = event.data.requestId as Hex;
  if (!deps.contracts.includes(contract)) return { state: "skipped", reason: "unknown-contract" };

  const read = await readRequest(contract, requestId, step, deps);
  const { request } = read;
  if (request.status !== "pending") return { state: "skipped", reason: "not-pending" };
  if (read.oracle !== deps.oracle) return { state: "skipped", reason: "not-our-oracle" };

  const target = classifyTarget(request.targetUal, deps.contextGraph);
  if (target === "elsewhere") return { state: "waiting", reason: "target-elsewhere" };
  const oracle = (id: string, input: OracleInput) => callOracle(id, input, step);
  if (target === "invalid") {
    const answer = await oracle("cancel", cancelOf(contract, requestId, "invalid-target"));
    return outcomeOf(answer, undefined, logger);
  }

  const name = rKaName(requestId);
  if (!name.ok) return { state: "skipped", reason: "bad-event" };
  const expired = read.at - request.requestedAt * 1000 > RATING_SETTINGS.maxAgeMs;
  const run: RunContext = {
    contract,
    requestId,
    name: name.name,
    targetUal: request.targetUal,
    expired,
    step,
    deps,
  };

  let last: Attempt | undefined;
  for (let attempt = 1; attempt <= RATING_SETTINGS.attempts; attempt++) {
    const result = await rateOnce(attempt, run);
    if (result.kind === "fulfil") {
      const answer = await oracle("fulfil", {
        contract,
        requestId,
        action: { kind: "fulfil", score: result.score, rKaUal: result.rKaUal },
      });
      return outcomeOf(answer, result.rKaUal, logger);
    }
    if (result.kind === "expire") {
      const answer = await oracle("cancel", cancelOf(contract, requestId, "expired"));
      return outcomeOf(answer, result.orphan, logger);
    }
    if (result.kind === "fatal") throw stop(result.failure, `${name.name}: ${result.reason}`);
    last = result;
    if (result.kind === "retry" && attempt < RATING_SETTINGS.attempts) {
      await step.sleep(`retry-${attempt}`, RATING_SETTINGS.retryWait);
    }
  }
  const failure = last?.kind === "retry" ? last.failure : "mint-not-confirmed";
  const reason = last?.kind === "retry" ? last.reason : "mint not seen";
  throw stop(failure, `${name.name} gave up after ${RATING_SETTINGS.attempts} attempts: ${reason}`);
}

interface RunContext {
  readonly contract: Hex;
  readonly requestId: Hex;
  readonly name: string;
  readonly targetUal: string;
  readonly expired: boolean;
  readonly step: RatingSteps;
  readonly deps: RatingDeps;
  /** The score once it came back, kept across attempts so it is never computed again. */
  scored?: { readonly output: ScorerOutput; readonly model: string };
}

async function readRequest(
  contract: Hex,
  requestId: Hex,
  step: RatingSteps,
  deps: RatingDeps,
): Promise<Extract<ReadRequestStep, { ok: true }>> {
  for (let attempt = 1; ; attempt++) {
    const read: ReadRequestStep = await step.run(
      attempt === 1 ? "read-request" : `read-request-${attempt}`,
      async () => {
        const request = await deps.readRequest(contract, requestId);
        const oracle = await deps.readOracle(contract);
        if (!request.ok || !oracle.ok) return { ok: false };
        return { ok: true, request: request.request, oracle: oracle.oracle, at: deps.now() };
      },
    );
    if (read.ok) return read;
    if (attempt === RATING_SETTINGS.attempts) {
      throw stop("chain-unreachable", `request ${requestId}: chain unreachable`);
    }
    await step.sleep(`read-request-retry-${attempt}`, RATING_SETTINGS.retryWait);
  }
}

async function rateOnce(attempt: number, run: RunContext): Promise<Attempt> {
  const { step, deps, name } = run;
  const read = await step.run(`read-rka-${attempt}`, () => deps.dkg.readAsset(name));
  if (!read.ok) return failed(read);
  if (read.state === "minted") return readScore(attempt, read.ual, run);

  if (run.expired) {
    if (read.state !== "stored") return { kind: "expire" };
    // An earlier mint may still land; past the maximum age, no new one is started.
    const ual = await poll(attempt, run);
    if (typeof ual !== "string") return ual ?? { kind: "expire", orphan: read.reservedUal };
    return readScore(attempt, ual, run);
  }

  if (read.state === "missing") {
    const scored = await score(attempt, run);
    if ("kind" in scored) return scored;
    const quads = rKaQuads({
      requestId: run.requestId,
      targetUal: run.targetUal,
      contract: `eip155:${deps.chainId}:${run.contract}`,
      output: scored.output,
      model: scored.model,
      promptVersion: SCORER_PROMPT_VERSION,
    });
    const stored = await step.run(`store-${attempt}`, () => deps.dkg.storeAsset(name, quads));
    if (!stored.ok) return failed(stored);
    if (stored.state === "minted") return readScore(attempt, stored.ual, run);
  } else if (read.state === "draft") {
    // A draft is sealed with its content: storing it only shares it.
    const shared = await step.run(`store-${attempt}`, () => deps.dkg.storeAsset(name, []));
    if (!shared.ok) return failed(shared);
    if (shared.state === "minted") return readScore(attempt, shared.ual, run);
  }

  const mint = await step.run(`mint-${attempt}`, () =>
    deps.dkg.startMint(name, { listenMs: RATING_SETTINGS.listenMs }),
  );
  if (!mint.ok) return failed(mint);
  if (mint.state === "minted") return readScore(attempt, mint.ual, run);
  const ual = await poll(attempt, run);
  if (typeof ual !== "string") return ual ?? { kind: "mint-again" };
  return readScore(attempt, ual, run);
}

/** The score, from an earlier attempt or from the scorer, reading the target first. */
async function score(
  attempt: number,
  run: RunContext,
): Promise<NonNullable<RunContext["scored"]> | Attempt> {
  if (run.scored) return run.scored;
  const { step, deps } = run;
  const sparql = targetTriplesQuery(deps.contextGraph, run.targetUal, RATING_SETTINGS.maxTriples);
  if (!sparql) return { kind: "fatal", failure: "setup", reason: "target query refused" };
  const rows = await step.run(`read-target-${attempt}`, () => deps.dkg.query(sparql));
  if (!rows.ok) return failed(rows);
  const triples = triplesFromBindings(rows.bindings);
  if (triples.length === 0) {
    return { kind: "retry", failure: "target-unreadable", reason: "the target has no triples" };
  }

  const result = await step.run(`score-${attempt}`, () => deps.score(triples));
  if (!result.ok) {
    return result.reason === "unauthorized"
      ? { kind: "fatal", failure: "setup", reason: "Gemini refused our key" }
      : { kind: "retry", failure: "scorer-unavailable", reason: `scorer ${result.reason}` };
  }
  run.scored = { output: result.output, model: result.model };
  return run.scored;
}

/** Polls the R-KA's state; its UAL once minted, a failure, or `undefined` after every poll. */
async function poll(attempt: number, run: RunContext): Promise<string | Attempt | undefined> {
  const { step, deps, name } = run;
  for (let poll = 1; poll <= RATING_SETTINGS.pollsPerMint; poll++) {
    await step.sleep(`wait-${attempt}-${poll}`, RATING_SETTINGS.pollInterval);
    const state = await step.run(`poll-${attempt}-${poll}`, () => deps.dkg.readAsset(name));
    if (!state.ok) return failed(state);
    if (state.state === "minted") return state.ual;
  }
  return undefined;
}

/** Reads the score back from the minted R-KA, so the chain records the R-KA's score. */
async function readScore(attempt: number, ual: string, run: RunContext): Promise<Attempt> {
  const { step, deps } = run;
  const sparql = ratingQuery(deps.contextGraph, ual);
  if (!sparql) {
    return { kind: "fatal", failure: "rating-unreadable", reason: `${ual} is not our node's` };
  }
  const rows = await step.run(`read-score-${attempt}`, () => deps.dkg.query(sparql));
  if (!rows.ok) return failed(rows);
  if (rows.bindings.length === 0) {
    return { kind: "retry", failure: "node-unreachable", reason: `${ual} not readable yet` };
  }
  const rating = parseRating(rows.bindings);
  if (!rating)
    return { kind: "fatal", failure: "rating-unreadable", reason: `${ual} has no score` };
  return { kind: "fulfil", score: rating.score, rKaUal: ual };
}

function failed(failure: DkgFailure): Attempt {
  const reason =
    failure.status === undefined ? failure.reason : `${failure.reason} (${failure.status})`;
  return failure.reason === "unauthorized" || failure.reason === "graph-not-served"
    ? { kind: "fatal", failure: "setup", reason }
    : { kind: "retry", failure: "node-unreachable", reason };
}

function cancelOf(
  contract: Hex,
  requestId: Hex,
  reason: "expired" | "invalid-target",
): OracleInput {
  return { contract, requestId, action: { kind: "cancel", reason } };
}

async function callOracle(id: string, input: OracleInput, step: RatingSteps) {
  try {
    return await step.oracle(id, input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw stop("oracle-failed", `request ${input.requestId}: ${detail}`, error);
  }
}

/** The run's outcome from the oracle's answer; `orphan` is an R-KA a cancel leaves unrecorded. */
function outcomeOf(
  answer: OracleResult,
  orphan: string | undefined,
  logger: OracleLogger,
): RatingOutcome {
  switch (answer.state) {
    case "fulfilled":
      return { state: "fulfilled", score: answer.score, rKaUal: answer.rKaUal };
    case "cancelled":
      if (!orphan) return { state: "cancelled", reason: answer.reason };
      logger.error(`rating-orphan: ${orphan} was minted for a request cancelled ${answer.reason}`);
      return { state: "cancelled", reason: answer.reason, orphan };
    case "not-our-oracle":
      return { state: "skipped", reason: "not-our-oracle" };
    case "unknown":
      return { state: "skipped", reason: "not-pending" };
  }
}

/**
 * The `rate-paper` Inngest function, run by `verisci/rating.requested`: a singleton per
 * request id in mode `skip` (ADR 0020), with a 45-minute budget, throttled when `throttle`
 * (outside `local`, ADR 0015). It invokes `oracle` to fulfil or cancel. `getDeps` builds the
 * adapters on the first run, so importing the function validates no settings.
 */
export function createRatePaper(
  inngest: Inngest.Any,
  getDeps: () => RatingDeps,
  oracle: InngestFunction.Any,
  options: { readonly throttle: boolean },
) {
  return inngest.createFunction(
    {
      id: "rate-paper",
      triggers: [{ event: RATING_REQUESTED }],
      singleton: { key: "event.data.requestId", mode: "skip" },
      timeouts: { finish: RATING_SETTINGS.finishTimeout },
      ...(options.throttle ? { throttle: { ...RATING_SETTINGS.throttle } } : {}),
    },
    async ({ event, step, logger }) =>
      runRating(
        event.data,
        {
          run: (id, fn) => step.run(id, fn) as never,
          sleep: (id, duration) => step.sleep(id, duration),
          oracle: (id, input) =>
            step.invoke(id, {
              function: oracle,
              data: input,
              timeout: RATING_SETTINGS.oracleTimeout,
            }) as Promise<OracleResult>,
        },
        loadRatingDeps(getDeps),
        logger,
      ),
  );
}

/** The run's adapters from `getDeps`; missing or invalid settings stop the run (`setup`). */
export function loadRatingDeps(getDeps: () => RatingDeps): RatingDeps {
  try {
    return getDeps();
  } catch (error) {
    throw stop(
      "setup",
      `rating settings: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
