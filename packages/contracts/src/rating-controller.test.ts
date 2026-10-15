import { AbiDecodingZeroDataError, decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ratingControllerAbi } from "./generated/rating-controller-abi.ts";
import {
  type ContractReader,
  cancelCalldata,
  fulfilCalldata,
  readOracleAgent,
  readRatingRequest,
  readRequestIdsOf,
} from "./rating-controller.ts";

const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const REQUEST_ID = `0x${"ab".repeat(32)}` as const;
const TARGET = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/7";
const R_KA = "did:dkg:base:84532/0xd701ed157232ad5e14bc4134a8d10d64d86f13b3/12";

function reader(
  answer: () => Promise<unknown>,
): ContractReader & { readContract: ReturnType<typeof vi.fn> } {
  return { readContract: vi.fn(answer) } as never;
}

const STRUCT = {
  requester: "0x9A17ec95E96f8a7C40B7Ac1411E8A844C7bF9111",
  requestedAt: 1_791_639_437n,
  status: 2,
  cancelReason: 0,
  phase1Score: 72,
  targetUal: TARGET,
  rKaUal: R_KA,
};

describe("readRatingRequest", () => {
  it("reads getRatingRequest and maps the struct", async () => {
    const client = reader(async () => STRUCT);

    expect(await readRatingRequest(client, CONTRACT, REQUEST_ID)).toEqual({
      ok: true,
      request: {
        status: "fulfilled",
        cancelReason: "none",
        requester: "0x9a17ec95e96f8a7c40b7ac1411e8a844c7bf9111",
        requestedAt: 1_791_639_437,
        score: 72,
        targetUal: TARGET,
        rKaUal: R_KA,
      },
    });
    expect(client.readContract).toHaveBeenCalledWith({
      address: CONTRACT,
      abi: ratingControllerAbi,
      functionName: "getRatingRequest",
      args: [REQUEST_ID],
    });
  });

  it.each([
    [0, "none"],
    [1, "pending"],
    [2, "fulfilled"],
    [3, "cancelled"],
  ])("maps status %i to %s", async (status, name) => {
    const result = await readRatingRequest(
      reader(async () => ({ ...STRUCT, status })),
      CONTRACT,
      REQUEST_ID,
    );

    expect(result.ok && result.request.status).toBe(name);
  });

  it.each([
    [1, "expired"],
    [2, "invalid-target"],
  ])("maps cancel reason %i to %s", async (cancelReason, name) => {
    const result = await readRatingRequest(
      reader(async () => ({ ...STRUCT, status: 3, cancelReason })),
      CONTRACT,
      REQUEST_ID,
    );

    expect(result.ok && result.request.cancelReason).toBe(name);
  });

  it("reads an unknown id as status none", async () => {
    const unknown = {
      requester: "0x0000000000000000000000000000000000000000",
      requestedAt: 0n,
      status: 0,
      cancelReason: 0,
      phase1Score: 0,
      targetUal: "",
      rKaUal: "",
    };

    const result = await readRatingRequest(
      reader(async () => unknown),
      CONTRACT,
      REQUEST_ID,
    );

    expect(result.ok && result.request.status).toBe("none");
  });

  it.each([
    ["an RPC error", () => Promise.reject(new Error("HTTP request failed"))],
    ["a timeout", () => Promise.reject(new Error("The request took too long to respond."))],
    ["a status the contract never writes", async () => ({ ...STRUCT, status: 9 })],
  ])("gives unreachable for %s", async (_, answer) => {
    expect(await readRatingRequest(reader(answer), CONTRACT, REQUEST_ID)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("readOracleAgent", () => {
  it("reads the oracle's address in lowercase", async () => {
    const client = reader(async () => "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

    expect(await readOracleAgent(client, CONTRACT)).toEqual({
      ok: true,
      oracle: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    });
    expect(client.readContract).toHaveBeenCalledWith({
      address: CONTRACT,
      abi: ratingControllerAbi,
      functionName: "oracleAgent",
    });
  });

  it("gives unreachable when the RPC fails", async () => {
    expect(
      await readOracleAgent(
        reader(() => Promise.reject(new Error("down"))),
        CONTRACT,
      ),
    ).toEqual({ ok: false, reason: "unreachable" });
  });
});

describe("calldata", () => {
  it("encodes fulfilPhase1 with the request id, score and R-KA UAL", () => {
    expect(
      decodeFunctionData({ abi: ratingControllerAbi, data: fulfilCalldata(REQUEST_ID, 72, R_KA) }),
    ).toEqual({ functionName: "fulfilPhase1", args: [REQUEST_ID, 72, R_KA] });
  });

  it.each([
    ["expired", 1],
    ["invalid-target", 2],
  ] as const)("encodes cancelRequest with %s as %i", (reason, code) => {
    expect(
      decodeFunctionData({ abi: ratingControllerAbi, data: cancelCalldata(REQUEST_ID, reason) }),
    ).toEqual({ functionName: "cancelRequest", args: [REQUEST_ID, code] });
  });
});

describe("readRequestIdsOf", () => {
  const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

  /** A contract holding `ids` for TARGET, answering `requestIdsOf` page by page. */
  function contractWith(ids: readonly `0x${string}`[]) {
    return reader(async () => undefined).readContract.mockImplementation(
      async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
        if (functionName === "requestCountOf") return BigInt(ids.length);
        const [, offset, limit] = args as [string, bigint, bigint];
        return ids.slice(Number(offset), Number(offset) + Number(limit));
      },
    );
  }

  it("returns a target's request ids oldest first", async () => {
    const readContract = contractWith([id(1), id(2), id(3)]);

    expect(await readRequestIdsOf({ readContract } as never, CONTRACT, TARGET)).toEqual({
      ok: true,
      ids: [id(1), id(2), id(3)],
    });
    expect(readContract).toHaveBeenCalledWith({
      address: CONTRACT,
      abi: ratingControllerAbi,
      functionName: "requestCountOf",
      args: [TARGET],
    });
  });

  it("reads every page when a target has more than 50 requests", async () => {
    const ids = Array.from({ length: 120 }, (_, n) => id(n + 1));
    const readContract = contractWith(ids);

    const result = await readRequestIdsOf({ readContract } as never, CONTRACT, TARGET);

    expect(result).toEqual({ ok: true, ids });
    const pages = readContract.mock.calls.filter(([call]) => call.functionName === "requestIdsOf");
    expect(pages.map(([call]) => call.args)).toEqual([
      [TARGET, 0n, 50n],
      [TARGET, 50n, 50n],
      [TARGET, 100n, 50n],
    ]);
  });

  it("returns an empty list for a target with no request, with one read", async () => {
    const readContract = contractWith([]);

    expect(await readRequestIdsOf({ readContract } as never, CONTRACT, TARGET)).toEqual({
      ok: true,
      ids: [],
    });
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("is unreachable when the RPC fails", async () => {
    const client = reader(async () => {
      throw new Error("timeout");
    });

    expect(await readRequestIdsOf(client, CONTRACT, TARGET)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("is unreachable when the reply doesn't decode, as from an address with no contract", async () => {
    const client = reader(async () => {
      throw new AbiDecodingZeroDataError();
    });

    expect(await readRequestIdsOf(client, CONTRACT, TARGET)).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});
