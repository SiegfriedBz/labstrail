"use client";

import { useAppKit } from "@reown/appkit/react";
import { ratingControllerAbi } from "@verisci/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { announceLocalRating } from "../../app/actions.ts";
import type { RatingChainConfig } from "../../lib/rating/chain.ts";
import { requestMessage } from "../../lib/rating/messages.ts";
import { type RequestResult, requestRating } from "../../lib/rating/request-flow.ts";
import { useWalletReady } from "../wallet/providers.tsx";

/** How long the button waits for the request's transaction to be mined. */
const RECEIPT_TIMEOUT_MS = 90_000;

/** The "Rate this paper" button, or a note when the wallet window is not set up on this server. */
export function RateButton(props: { ual: string; cid: string; config: RatingChainConfig }) {
  if (!useWalletReady()) {
    return (
      <p className="text-sm text-muted">
        Wallet connection isn't set up on this server yet, so ratings can't be requested here.
      </p>
    );
  }
  return <RateFlow {...props} />;
}

type Phase = "idle" | "sending" | "confirming";

/**
 * Requests a rating from the visitor's wallet (`requestRating`), then opens the rating's page,
 * which follows it. Names a revert it knows, and says when the request is on chain but its
 * receipt or, locally, its announce did not come.
 */
function RateFlow({ ual, cid, config }: { ual: string; cid: string; config: RatingChainConfig }) {
  const router = useRouter();
  const wagmi = useConfig();
  const { address, chainId } = useAccount();
  const { open } = useAppKit();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<RequestResult | undefined>();

  const rate = async () => {
    setResult(undefined);
    setPhase("sending");
    const answer = await requestRating(ual, {
      chainId: config.chainId,
      contract: config.contract,
      local: config.local,
      account: () => (address ? { address, chainId } : undefined),
      connect: () => void open(),
      switchChain: async (id) => {
        await switchChainAsync({ chainId: id });
      },
      sendRequest: async (target) => {
        const hash = await writeContractAsync({
          address: config.contract as `0x${string}`,
          abi: ratingControllerAbi,
          functionName: "requestPhase1",
          args: [target],
          chainId: config.chainId,
        });
        setPhase("confirming");
        return hash;
      },
      waitForReceipt: async (hash) => {
        const receipt = await waitForTransactionReceipt(wagmi, {
          hash,
          chainId: config.chainId,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        return { reverted: receipt.status === "reverted", logs: receipt.logs };
      },
      announce: (hash) => announceLocalRating(hash),
    });
    setPhase("idle");
    if (answer.ok && "requestId" in answer && !answer.notAnnounced) {
      router.push(`/papers/${cid}/ratings/${answer.requestId}`);
      return;
    }
    setResult(answer);
  };

  const busy = phase !== "idle";
  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => void rate()}
        disabled={busy}
        aria-busy={busy}
        className="signal-gradient w-fit rounded-xl px-5 py-2.5 font-semibold text-accent-ink transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
      >
        {phase === "sending"
          ? "Confirm in your wallet"
          : phase === "confirming"
            ? "Waiting for the transaction"
            : "Rate this paper"}
      </button>
      {result && <ResultNote result={result} cid={cid} />}
    </div>
  );
}

function ResultNote({ result, cid }: { result: RequestResult; cid: string }) {
  if (!result.ok) {
    if (result.problem === "connect" || result.problem === "declined") return null;
    return (
      <p role="alert" className="text-sm text-danger">
        {requestMessage(result.problem)}
      </p>
    );
  }
  if ("unconfirmed" in result) {
    return (
      <p role="status" className="text-sm leading-relaxed text-muted">
        Your request was sent. It shows in this list once its transaction is confirmed.
      </p>
    );
  }
  return (
    <p role="status" className="text-sm leading-relaxed text-muted">
      Your request is on chain, but its rating didn't start: the local Inngest dev server didn't
      answer.{" "}
      <Link href={`/papers/${cid}/ratings/${result.requestId}`} className="link">
        Open the request
      </Link>
    </p>
  );
}
