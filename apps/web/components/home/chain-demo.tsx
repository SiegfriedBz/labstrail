"use client";

import { FilePdf } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { PaperStage } from "../../lib/progress.ts";
import { ProgressChain } from "../paper/progress-chain.tsx";

const LOOP: PaperStage["stage"][] = ["reading", "saving", "minting", "published"];
const STEP_MS = 1800;

/**
 * The paper the demo publishes: a real record on the staging graph whose signature checks
 * out, the same as the example asset further down the home page.
 */
const PAPER = {
  title:
    "Emerging trends in nanomedicine: The role of RNAi-based therapies and onpattro's clinical journey",
  pdf: "ipfs://bafybeia54htwu…sp5sfhgi",
  ual: "did:dkg:base:84532/0xd701…13b3/7",
} as const;

/** What the asset's row says before the mint gives it a UAL. */
const PENDING: Partial<Record<PaperStage["stage"], string>> = {
  reading: "Given once minted",
  saving: "Given once minted",
  minting: "Minting on Base…",
};

/**
 * The publish flow playing on a loop, for the home page's hero: a PDF goes in, the chain
 * runs, and the Knowledge Asset's UAL comes out. Still at "minting" for visitors who ask
 * for reduced motion.
 */
export function ChainDemo() {
  const [index, setIndex] = useState(2);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % LOOP.length), STEP_MS);
    return () => clearInterval(timer);
  }, []);
  const stage = LOOP[index] ?? "minting";
  const minted = stage === "published";
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-strong/60 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted">
          <FilePdf aria-hidden size={20} />
        </span>
        <div className="grid min-w-0 gap-0.5">
          <p className="line-clamp-2 text-sm font-medium">{PAPER.title}</p>
          {/* A span: globals.css's `p { text-wrap: pretty }` would undo `truncate`. */}
          <span className="block truncate font-mono text-xs text-muted">{PAPER.pdf}</span>
        </div>
      </div>
      <ProgressChain stage={stage} />
      <div
        className={`grid gap-1 rounded-xl border p-3 transition-colors duration-500 ${
          minted ? "border-accent-2/40 bg-accent-2-soft" : "border-dashed border-line-strong"
        }`}
      >
        <span className="text-xs text-muted">Knowledge Asset (UAL)</span>
        <span
          className={`truncate font-mono text-xs transition-colors duration-500 ${minted ? "text-accent-2" : "text-muted"}`}
        >
          {minted ? PAPER.ual : PENDING[stage]}
        </span>
      </div>
    </div>
  );
}
