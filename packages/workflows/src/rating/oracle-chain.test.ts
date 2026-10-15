import {
  BaseError,
  ExecutionRevertedError,
  type Hex,
  InsufficientFundsError,
  NonceTooLowError,
  TransactionReceiptNotFoundError,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { createOracleChain, sendFailure } from "./oracle-chain.ts";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const HASH = `0x${"cd".repeat(32)}` as Hex;
const FEES = { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 100_000_000n };

describe("sendFailure", () => {
  it.each([
    ["nonce too low", new BaseError("send failed", { cause: new NonceTooLowError() }), "in-flight"],
    ["a replacement underpriced", new Error("replacement transaction underpriced"), "in-flight"],
    ["already known", new Error("already known"), "in-flight"],
    [
      "insufficient funds",
      new BaseError("send failed", { cause: new InsufficientFundsError() }),
      "no-funds",
    ],
    [
      "a reverted estimate",
      new BaseError("estimate failed", { cause: new ExecutionRevertedError() }),
      "reverted",
    ],
    ["anything else", new Error("HTTP request failed"), "unreachable"],
    ["a value that is not an error", "boom", "unreachable"],
  ])("reads %s as %s", (_, error, reason) => {
    expect(sendFailure(error)).toBe(reason);
  });
});

function fakeClients() {
  const client = {
    getTransactionCount: vi.fn(async ({ blockTag }: { blockTag: string }) =>
      blockTag === "pending" ? 5 : 4,
    ),
    readContract: vi.fn(),
    estimateFeesPerGas: vi.fn(async () => FEES),
    getTransactionReceipt: vi.fn(async () => ({ status: "success" })),
  };
  const wallet = { sendTransaction: vi.fn(async () => HASH) };
  const chain = createOracleChain({
    client: client as never,
    wallet: wallet as never,
    account: { address: ACCOUNT } as never,
  });
  return { client, wallet, chain };
}

describe("createOracleChain", () => {
  it("names the oracle by its lowercase address", () => {
    expect(fakeClients().chain.account).toBe(ACCOUNT.toLowerCase());
  });

  it("reads the latest and pending nonces", async () => {
    const { chain, client } = fakeClients();

    expect(await chain.nonces()).toEqual({ ok: true, latest: 4, pending: 5 });
    expect(client.getTransactionCount).toHaveBeenCalledWith({
      address: ACCOUNT,
      blockTag: "latest",
    });
  });

  it("reads nonces as not ok when the RPC fails", async () => {
    const { chain, client } = fakeClients();
    client.getTransactionCount.mockRejectedValueOnce(new Error("down"));

    expect(await chain.nonces()).toEqual({ ok: false });
  });

  it("estimates both fees", async () => {
    expect(await fakeClients().chain.estimateFees()).toEqual({ ok: true, fees: FEES });
  });

  it("sends at the nonce and fees given, with no value", async () => {
    const { chain, wallet } = fakeClients();

    expect(await chain.send({ to: CONTRACT, data: "0x1234", nonce: 4, fees: FEES })).toEqual({
      ok: true,
      hash: HASH,
    });
    expect(wallet.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        to: CONTRACT,
        data: "0x1234",
        nonce: 4,
        value: 0n,
        ...FEES,
      }),
    );
  });

  it("gives the reason a send was refused", async () => {
    const { chain, wallet } = fakeClients();
    wallet.sendTransaction.mockRejectedValueOnce(new Error("replacement transaction underpriced"));

    expect(await chain.send({ to: CONTRACT, data: "0x", nonce: 4, fees: FEES })).toEqual({
      ok: false,
      reason: "in-flight",
    });
  });

  it("reads a receipt's status, none when the node has no receipt yet, not ok when it fails", async () => {
    const { chain, client } = fakeClients();

    expect(await chain.receipt(HASH)).toEqual({ ok: true, state: "success" });
    client.getTransactionReceipt.mockResolvedValueOnce({ status: "reverted" });
    expect(await chain.receipt(HASH)).toEqual({ ok: true, state: "reverted" });
    client.getTransactionReceipt.mockRejectedValueOnce(
      new TransactionReceiptNotFoundError({ hash: HASH }),
    );
    expect(await chain.receipt(HASH)).toEqual({ ok: true, state: "none" });
    client.getTransactionReceipt.mockRejectedValueOnce(new Error("down"));
    expect(await chain.receipt(HASH)).toEqual({ ok: false });
  });
});
