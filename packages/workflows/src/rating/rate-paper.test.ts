import type { RatingRequestState, ReadRequestResult } from "@verisci/contracts";
import {
  publishedPaperQuery,
  type QueryBinding,
  rKaQuads,
  SCORER_PROMPT_VERSION,
  type ScorerOutput,
  type Triple,
  targetTriplesQuery,
} from "@verisci/core";
import type { AssetResult, DkgFailure, MintResult, QueryResult } from "@verisci/dkg";
import { Inngest, NonRetriableError } from "inngest";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import type { OracleInput, OracleResult } from "./oracle.ts";
import {
  createRatePaper,
  loadRatingDeps,
  RATING_SETTINGS,
  type RatingDeps,
  type RatingSteps,
  ratingFailureReason,
  runRating,
} from "./rate-paper.ts";
import type { ScoreResult } from "./scorer.ts";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const ORACLE = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const GRAPH = "0xD701ed157232ad5E14BC4134a8D10D64D86f13B3/verisci-staging";
const AGENT = "0xd701ed157232ad5e14bc4134a8d10d64d86f13b3";
const TARGET = `did:dkg:base:84532/${AGENT}/7`;
const R_KA = `did:dkg:base:84532/${AGENT}/12`;
const REQUEST_ID = `0x${"ab".repeat(32)}` as Hex;
const NAME = `verisci-rka-${REQUEST_ID}`;
const NOW = 1_800_000_000_000;
const YOUNG = NOW / 1000 - 60;
const OLD = NOW / 1000 - 25 * 3600;
const EVENT = { contract: CONTRACT, requestId: REQUEST_ID };
const ELSEWHERE = "did:dkg:base:84532/0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111/3";

const OUTPUT: ScorerOutput = {
  score: 72,
  rationale: "The record states a claim and its methods.",
  observed: ["claim", "methods", "identifier", "authors"],
  missing: ["data", "results", "limitations", "availability"],
};
const TARGET_TRIPLES: Triple[] = [
  { subject: "urn:verisci:paper:x", predicate: "http://schema.org/name", object: '"A title"' },
];
const rows = (triples: readonly Triple[]): QueryBinding[] =>
  triples.map((t) => ({ s: t.subject, p: t.predicate, o: t.object }));
const ratingRows = (score: number) =>
  rows(
    rKaQuads({
      requestId: REQUEST_ID,
      targetUal: TARGET,
      contract: `eip155:31337:${CONTRACT}`,
      output: { ...OUTPUT, score },
      model: "gemini-3.8-flash-001",
      promptVersion: SCORER_PROMPT_VERSION,
    }),
  );

const missing: AssetResult = { ok: true, state: "missing" };
const draft: AssetResult = { ok: true, state: "draft" };
const stored: AssetResult = { ok: true, state: "stored", reservedUal: R_KA };
const minted: AssetResult = { ok: true, state: "minted", ual: R_KA };
const minting: MintResult = { ok: true, state: "minting" };
const mintedNow: MintResult = { ok: true, state: "minted", ual: R_KA };
const unreachable = { ok: false as const, reason: "unreachable" as const };

const pending = (state: Partial<RatingRequestState> = {}): ReadRequestResult => ({
  ok: true,
  request: {
    status: "pending",
    cancelReason: "none",
    requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
    requestedAt: YOUNG,
    score: 0,
    targetUal: TARGET,
    rKaUal: "",
    ...state,
  },
});

/** Steps that run at once and record every step id, sleep and oracle call. */
function fakeSteps(oracleAnswer: (input: OracleInput) => OracleResult) {
  const log: string[] = [];
  const oracleCalls: OracleInput[] = [];
  const step: RatingSteps = {
    async run(id, fn) {
      log.push(id);
      return JSON.parse(JSON.stringify(await fn()));
    },
    async sleep(id, duration) {
      log.push(`sleep ${id} ${duration}`);
    },
    async oracle(id, input) {
      log.push(`oracle ${id}`);
      oracleCalls.push(input);
      return oracleAnswer(input);
    },
  };
  return { step, log, oracleCalls };
}

interface Script {
  requests?: ReadRequestResult[];
  oracle?: string;
  reads?: AssetResult[];
  stores?: AssetResult[];
  mints?: MintResult[];
  found?: QueryResult[];
  graph?: ({ ok: true } | DkgFailure)[];
  targetRows?: QueryResult[];
  ratingRows?: QueryResult[];
  scores?: ScoreResult[];
  oracleAnswer?: (input: OracleInput) => OracleResult;
}

/** The oracle settling whatever it is asked to, as a mined transaction would. */
function settles(input: OracleInput): OracleResult {
  return input.action.kind === "fulfil"
    ? { state: "fulfilled", score: input.action.score, rKaUal: input.action.rKaUal }
    : { state: "cancelled", reason: input.action.reason };
}

function rate(script: Script, data: unknown = EVENT) {
  const next = <T>(answers: T[]): T =>
    answers.length > 1 ? (answers.shift() as T) : (answers[0] as T);
  const requests = [...(script.requests ?? [pending()])];
  const reads = [...(script.reads ?? [missing])];
  const stores = [...(script.stores ?? [stored])];
  const mints = [...(script.mints ?? [mintedNow])];
  const found = [...(script.found ?? [{ ok: true, bindings: [{ ka: TARGET }] }])];
  const graph = [...(script.graph ?? [{ ok: true as const }])];
  const targetRows = [...(script.targetRows ?? [{ ok: true, bindings: rows(TARGET_TRIPLES) }])];
  const ratingRowsAnswers = [
    ...(script.ratingRows ?? [{ ok: true, bindings: ratingRows(OUTPUT.score) }]),
  ];
  const scores = [
    ...(script.scores ?? [{ ok: true, output: OUTPUT, model: "gemini-3.8-flash-001" }]),
  ];
  const foundQuery = publishedPaperQuery(GRAPH, TARGET);
  const targetQuery = targetTriplesQuery(GRAPH, TARGET, RATING_SETTINGS.maxTriples);
  const dkg = {
    readAsset: vi.fn(async () => next(reads)),
    storeAsset: vi.fn(async () => next(stores)),
    startMint: vi.fn(async () => next(mints)),
    checkGraph: vi.fn(async () => next(graph)),
    query: vi.fn(async (sparql: string) => {
      if (sparql === foundQuery) return next(found);
      return sparql === targetQuery ? next(targetRows) : next(ratingRowsAnswers);
    }),
  };
  const deps = {
    contracts: [CONTRACT],
    oracle: ORACLE,
    contextGraph: GRAPH,
    chainId: 31337,
    now: () => NOW,
    readRequest: vi.fn(async () => next(requests)),
    readOracle: vi.fn(async () => ({ ok: true as const, oracle: script.oracle ?? ORACLE })),
    dkg: dkg as unknown as RatingDeps["dkg"],
    score: vi.fn(async () => next(scores)),
  } satisfies RatingDeps;
  const { step, log, oracleCalls } = fakeSteps(script.oracleAnswer ?? settles);
  const logger = { error: vi.fn() };
  return { run: runRating(data, step, deps, logger), deps, dkg, log, oracleCalls, logger };
}

const fulfil = (score: number, rKaUal = R_KA): OracleInput => ({
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "fulfil", score, rKaUal },
});
const cancel = (reason: "expired" | "invalid-target"): OracleInput => ({
  contract: CONTRACT,
  requestId: REQUEST_ID,
  action: { kind: "cancel", reason },
});

describe("runRating: which requests it takes", () => {
  it.each([
    ["no data", null],
    ["an uppercase contract", { ...EVENT, contract: CONTRACT.toUpperCase() }],
    ["a short request id", { ...EVENT, requestId: "0xabcd" }],
    ["a missing request id", { contract: CONTRACT }],
  ])("skips %s, reading nothing", async (_, data) => {
    const { run, deps } = rate({}, data);

    expect(await run).toEqual({ state: "skipped", reason: "bad-event" });
    expect(deps.readRequest).not.toHaveBeenCalled();
  });

  it("skips a contract that is not one of the environment's, reading nothing", async () => {
    const { run, deps } = rate({}, { ...EVENT, contract: `0x${"11".repeat(20)}` });

    expect(await run).toEqual({ state: "skipped", reason: "unknown-contract" });
    expect(deps.readRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["fulfilled", pending({ status: "fulfilled", score: 72, rKaUal: R_KA })],
    ["cancelled", pending({ status: "cancelled", cancelReason: "expired" })],
    ["unknown", pending({ status: "none" })],
  ])("skips a request already %s, writing and scoring nothing", async (_, request) => {
    const { run, dkg, deps, oracleCalls } = rate({ requests: [request] });

    expect(await run).toEqual({ state: "skipped", reason: "not-pending" });
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(deps.score).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([]);
  });

  it("skips a contract whose oracle is not this deployment's key, before spending anything", async () => {
    const { run, dkg, deps, oracleCalls } = rate({ oracle: `0x${"22".repeat(20)}` });

    expect(await run).toEqual({ state: "skipped", reason: "not-our-oracle" });
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(deps.score).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([]);
  });

  it("has the oracle cancel an invalid target, without scoring", async () => {
    const { run, deps, dkg, oracleCalls } = rate({
      requests: [
        pending({ targetUal: TARGET.replace(AGENT, AGENT.toUpperCase().replace("0X", "0x")) }),
      ],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels a paper another publisher minted invalid-target at once, reading nothing", async () => {
    const { run, deps, dkg, oracleCalls } = rate({
      requests: [pending({ targetUal: ELSEWHERE })],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels invalid-target a UAL our node answers is none of its published papers", async () => {
    const { run, deps, dkg, log, oracleCalls } = rate({ found: [{ ok: true, bindings: [] }] });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(dkg.readAsset).not.toHaveBeenCalled();
    expect(dkg.query).toHaveBeenCalledWith(publishedPaperQuery(GRAPH, TARGET));
    expect(log).toEqual(["read-request", "find-target", "check-graph", "oracle cancel"]);
  });

  it("never cancels on an empty answer from a node that no longer serves the graph", async () => {
    const { run, oracleCalls, dkg } = rate({
      found: [{ ok: true, bindings: [] }],
      graph: [{ ok: false, reason: "graph-not-served" }],
    });

    await expect(run).rejects.toThrow(/^rating-failed:setup: .*graph-not-served/);
    expect(oracleCalls).toEqual([]);
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("fails setup before reading the R-KA when the node refuses the published-paper query", async () => {
    const { run, oracleCalls, dkg } = rate({ found: [{ ok: false, reason: "unauthorized" }] });

    await expect(run).rejects.toThrow(/^rating-failed:setup: /);
    expect(oracleCalls).toEqual([]);
    expect(dkg.readAsset).not.toHaveBeenCalled();
  });

  it("cancels invalid-target, not expired, a request past 24 hours for no published paper", async () => {
    const { run, oracleCalls } = rate({
      requests: [pending({ requestedAt: OLD })],
      found: [{ ok: true, bindings: [] }],
    });

    expect(await run).toEqual({ state: "cancelled", reason: "invalid-target" });
    expect(oracleCalls).toEqual([cancel("invalid-target")]);
  });

  it("retries, never cancels, when the node does not answer whether it published the paper", async () => {
    const { run, oracleCalls, log } = rate({
      found: [unreachable, { ok: true, bindings: [{ ka: TARGET }] }],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(oracleCalls.map((input) => input.action.kind)).toEqual(["fulfil"]);
    expect(log.slice(0, 4)).toEqual([
      "read-request",
      "find-target",
      "sleep find-target-retry-1 2m",
      "find-target-2",
    ]);
  });

  it("fails node-unreachable, leaving the request pending, when the node never answers", async () => {
    const { run, oracleCalls, log } = rate({ found: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:node-unreachable: /);
    expect(oracleCalls).toEqual([]);
    expect(log).toContain(`find-target-${RATING_SETTINGS.attempts}`);
  });
});

describe("runRating: rating a paper", () => {
  it("scores once, stores the R-KA, mints it and fulfils with the score read back", async () => {
    const { run, deps, dkg, log, oracleCalls } = rate({
      ratingRows: [{ ok: true, bindings: ratingRows(64) }],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 64, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "read-target-1",
      "score-1",
      "store-1",
      "mint-1",
      "read-score-1",
      "oracle fulfil",
    ]);
    expect(deps.score).toHaveBeenCalledOnce();
    expect(deps.score).toHaveBeenCalledWith(TARGET_TRIPLES);
    expect(dkg.storeAsset).toHaveBeenCalledWith(
      NAME,
      rKaQuads({
        requestId: REQUEST_ID,
        targetUal: TARGET,
        contract: `eip155:31337:${CONTRACT}`,
        output: OUTPUT,
        model: "gemini-3.8-flash-001",
        promptVersion: SCORER_PROMPT_VERSION,
      }),
    );
    expect(dkg.startMint).toHaveBeenCalledWith(NAME, { listenMs: RATING_SETTINGS.listenMs });
    expect(oracleCalls).toEqual([fulfil(64)]);
  });

  it("reads at most 200 of the target's triples", async () => {
    const { run, dkg } = rate({});

    await run;
    expect(dkg.query).toHaveBeenCalledWith(targetTriplesQuery(GRAPH, TARGET, 200));
  });

  it("fulfils an R-KA already minted with its score read back, never scoring", async () => {
    const { run, deps, log, oracleCalls } = rate({ reads: [minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "read-score-1",
      "oracle fulfil",
    ]);
    expect(deps.score).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([fulfil(72)]);
  });

  it("mints an R-KA already stored at once, polls every 30 s, then fulfils, never scoring", async () => {
    const { run, deps, dkg, log } = rate({
      reads: [stored, stored, minted],
      mints: [minting],
    });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(log).toEqual([
      "read-request",
      "find-target",
      "read-rka-1",
      "mint-1",
      "sleep wait-1-1 30s",
      "poll-1-1",
      "sleep wait-1-2 30s",
      "poll-1-2",
      "read-score-1",
      "oracle fulfil",
    ]);
    expect(dkg.storeAsset).not.toHaveBeenCalled();
    expect(deps.score).not.toHaveBeenCalled();
  });

  it("shares a draft R-KA, mints it and fulfils, never scoring", async () => {
    const { run, deps, dkg } = rate({ reads: [draft] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(dkg.storeAsset).toHaveBeenCalledWith(NAME, []);
    expect(deps.score).not.toHaveBeenCalled();
  });

  it("names the R-KA as an orphan when the request was cancelled meanwhile", async () => {
    const { run, logger } = rate({
      oracleAnswer: () => ({ state: "cancelled", reason: "expired" }),
    });

    expect(await run).toEqual({ state: "cancelled", reason: "expired", orphan: R_KA });
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^rating-orphan: /));
  });

  it("skips when the oracle finds the contract's oracle changed, or the request gone", async () => {
    expect(await rate({ oracleAnswer: () => ({ state: "not-our-oracle" }) }).run).toEqual({
      state: "skipped",
      reason: "not-our-oracle",
    });
    expect(await rate({ oracleAnswer: () => ({ state: "unknown" }) }).run).toEqual({
      state: "skipped",
      reason: "not-pending",
    });
  });
});

describe("runRating: past the maximum age", () => {
  const old = pending({ requestedAt: OLD });

  it("fulfils a minted R-KA", async () => {
    const { run, oracleCalls } = rate({ requests: [old], reads: [minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(oracleCalls).toEqual([fulfil(72)]);
  });

  it("polls a stored R-KA without minting it, and fulfils once it is minted", async () => {
    const { run, dkg } = rate({ requests: [old], reads: [stored, minted] });

    expect(await run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(dkg.startMint).not.toHaveBeenCalled();
  });

  it("cancels it expired when the stored R-KA is never minted, naming it as an orphan", async () => {
    const { run, dkg, log, oracleCalls, logger } = rate({ requests: [old], reads: [stored] });

    expect(await run).toEqual({ state: "cancelled", reason: "expired", orphan: R_KA });
    expect(dkg.startMint).not.toHaveBeenCalled();
    expect(log).toContain(`poll-1-${RATING_SETTINGS.pollsPerMint}`);
    expect(oracleCalls).toEqual([cancel("expired")]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^rating-orphan: /));
  });

  it.each([
    ["nothing stored", missing],
    ["a draft", draft],
  ])("cancels it expired with %s, scoring nothing", async (_, read) => {
    const { run, deps, oracleCalls } = rate({ requests: [old], reads: [read] });

    expect(await run).toEqual({ state: "cancelled", reason: "expired" });
    expect(deps.score).not.toHaveBeenCalled();
    expect(oracleCalls).toEqual([cancel("expired")]);
  });

  it("still scores a request exactly 24 hours old, and expires one a second older", async () => {
    const atLimit = rate({ requests: [pending({ requestedAt: NOW / 1000 - 24 * 3600 })] });
    expect(await atLimit.run).toEqual({ state: "fulfilled", score: 72, rKaUal: R_KA });
    expect(atLimit.deps.score).toHaveBeenCalledOnce();

    const past = rate({ requests: [pending({ requestedAt: NOW / 1000 - 24 * 3600 - 1 })] });
    expect(await past.run).toEqual({ state: "cancelled", reason: "expired" });
    expect(past.deps.score).not.toHaveBeenCalled();
  });
});

describe("runRating: retries", () => {
  it("reads the target again when a paper the node lists gives no rows yet", async () => {
    const { run, log } = rate({
      targetRows: [
        { ok: true, bindings: [] },
        { ok: true, bindings: rows(TARGET_TRIPLES) },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("read-target-2");
  });

  it("waits 2 minutes and reads the target again when the node does not answer", async () => {
    const { run, log } = rate({
      targetRows: [unreachable, { ok: true, bindings: rows(TARGET_TRIPLES) }],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
    expect(log).toContain("read-target-2");
  });

  it.each([
    ["unreachable", { ok: false, reason: "unreachable" } as const],
    ["rate-limited", { ok: false, reason: "rate-limited" } as const],
    ["invalid-output", { ok: false, reason: "invalid-output" } as const],
  ])("retries a scorer that is %s, then fails scorer-unavailable", async (_, failure) => {
    const { run, deps } = rate({ scores: [failure] });

    await expect(run).rejects.toThrow(/^rating-failed:scorer-unavailable: /);
    expect(deps.score).toHaveBeenCalledTimes(RATING_SETTINGS.attempts);
  });

  it("scores again after a failed score, then rates", async () => {
    const { run, deps } = rate({
      scores: [
        { ok: false, reason: "rate-limited" },
        { ok: true, output: OUTPUT, model: "gemini-3.8-flash-001" },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.score).toHaveBeenCalledTimes(2);
  });

  it("never scores again once a score came back, even when the store fails", async () => {
    const { run, deps, dkg, log } = rate({
      reads: [missing, missing],
      stores: [unreachable, stored],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(deps.score).toHaveBeenCalledOnce();
    expect(dkg.storeAsset).toHaveBeenCalledTimes(2);
    expect(log).toContain("store-2");
    expect(log).not.toContain("score-2");
  });

  it("retries a node that does not answer, then fails node-unreachable", async () => {
    const { run, dkg } = rate({ reads: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:node-unreachable: /);
    expect(dkg.readAsset).toHaveBeenCalledTimes(RATING_SETTINGS.attempts);
  });

  it("waits 2 minutes after a quorum failure on the mint", async () => {
    const { run, log } = rate({
      reads: [stored, stored],
      mints: [{ ok: false, reason: "retry-later" }, mintedNow],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(log).toContain("sleep retry-1 2m");
  });

  it("starts the mint again, with no wait, when it is not seen after 10 minutes", async () => {
    const { run, dkg, log } = rate({
      reads: [
        stored,
        ...Array.from({ length: RATING_SETTINGS.pollsPerMint }, () => stored),
        stored,
      ],
      mints: [minting, mintedNow],
    });

    expect(await run).toMatchObject({ state: "fulfilled" });
    expect(dkg.startMint).toHaveBeenCalledTimes(2);
    expect(log).not.toContain("sleep retry-1 2m");
    expect(log).toContain("mint-2");
  });

  it("retries a minted R-KA the node returns no rows for yet", async () => {
    const { run, log } = rate({
      reads: [minted],
      ratingRows: [
        { ok: true, bindings: [] },
        { ok: true, bindings: ratingRows(72) },
      ],
    });

    expect(await run).toMatchObject({ state: "fulfilled", score: 72 });
    expect(log).toContain("read-score-2");
  });

  it("retries a chain that does not answer, then fails chain-unreachable", async () => {
    const { run, deps, log } = rate({ requests: [unreachable] });

    await expect(run).rejects.toThrow(/^rating-failed:chain-unreachable: /);
    expect(deps.readRequest).toHaveBeenCalledTimes(RATING_SETTINGS.attempts);
    expect(log).toContain("read-request-5");
  });
});

describe("runRating: failures that stop the run at once", () => {
  it.each([
    [
      "the node refuses our credential",
      { reads: [{ ok: false, reason: "unauthorized" } as const] },
    ],
    [
      "the node does not serve the graph",
      { reads: [{ ok: false, reason: "graph-not-served" } as const] },
    ],
    [
      "Gemini refuses the request",
      { scores: [{ ok: false, reason: "refused", status: 403 } as const] },
    ],
  ])("fails setup when %s", async (_, script) => {
    const { run } = rate(script);

    await expect(run).rejects.toThrow(NonRetriableError);
    await expect(run).rejects.toThrow(/^rating-failed:setup: /);
  });

  it("names Gemini's status when it refuses the request, so a retired model reads as one", async () => {
    const { run } = rate({ scores: [{ ok: false, reason: "refused", status: 404 }] });

    await expect(run).rejects.toThrow(/Gemini refused the request \(HTTP 404\)/);
  });

  it("fails rating-unreadable when a minted R-KA's score cannot be read back", async () => {
    const { run, oracleCalls } = rate({
      reads: [minted],
      ratingRows: [{ ok: true, bindings: [{ s: "x", p: "y", o: "z" }] }],
    });

    await expect(run).rejects.toThrow(/^rating-failed:rating-unreadable: /);
    expect(oracleCalls).toEqual([]);
  });

  it("fails oracle-failed when the oracle function fails", async () => {
    const { run } = rate({
      oracleAnswer: () => {
        throw new Error("oracle-failed:oracle-stuck: nothing settled in time");
      },
    });

    await expect(run).rejects.toThrow(/^rating-failed:oracle-failed: /);
  });
});

describe("ratingFailureReason", () => {
  it("finds the reason a failed run's error carries, wherever Inngest nests it", () => {
    const error = { name: "NonRetriableError", message: "rating-failed:scorer-unavailable: x" };

    expect(ratingFailureReason(error)).toBe("scorer-unavailable");
    expect(ratingFailureReason({ error })).toBe("scorer-unavailable");
    expect(ratingFailureReason(JSON.stringify([{ op: "StepFailed", error }]))).toBe(
      "scorer-unavailable",
    );
  });

  it("finds none in an error that carries no known reason", () => {
    expect(ratingFailureReason({ message: "rating-failed:odd: x" })).toBeUndefined();
    expect(ratingFailureReason(undefined)).toBeUndefined();
  });
});

describe("loadRatingDeps", () => {
  it("stops the run without retries when the settings are missing or invalid", () => {
    const load = () =>
      loadRatingDeps(() => {
        throw new Error("Invalid environment variables:\n  GEMINI_API_KEY: Required");
      });

    expect(load).toThrow(NonRetriableError);
    expect(load).toThrow(/^rating-failed:setup: .*GEMINI_API_KEY/s);
  });
});

describe("createRatePaper", () => {
  const inngest = new Inngest({ id: "verisci-test" });
  const oracleFn = inngest.createFunction({ id: "oracle-transaction" }, async () => null);
  const build = (throttle: boolean) =>
    createRatePaper(inngest, () => rate({}).deps, oracleFn, { throttle });

  it("runs on verisci/rating.requested as a singleton per request id, skipping new runs", () => {
    const fn = build(true);

    expect(fn.opts.id).toBe("rate-paper");
    expect(fn.opts.triggers).toEqual([{ event: "verisci/rating.requested" }]);
    expect(fn.opts.singleton).toEqual({ key: "event.data.requestId", mode: "skip" });
    expect(fn.opts.timeouts).toEqual({ finish: "150m" });
  });

  it("throttles to 3 starts an hour in a deployment, and not locally", () => {
    expect(build(true).opts.throttle).toEqual({ limit: 3, period: "1h", burst: 3 });
    expect(build(false).opts.throttle).toBeUndefined();
  });
});
