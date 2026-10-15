"use client";

import { FilePdf } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { PaperStage } from "../../lib/publish/progress.ts";
import { ProgressChain, StepChain } from "../paper/progress-chain.tsx";
import { RATING_STEPS } from "../rating/rating-steps.ts";

/** The demo's two flows, in the order it plays them. */
type Flow = "publish" | "rate";

const PUBLISH_LOOP: PaperStage["stage"][] = ["reading", "saving", "minting", "published"];

/** The rating's frames: each step running in turn, then every step done. */
const RATE_FRAMES = RATING_STEPS.length + 1;

const STEP_MS = 1800;

/** Each flow's last frame, its result, stays up this many steps. */
const HOLD_STEPS = 2;

/** The frame shown to visitors who ask for reduced motion: the mint, in either flow. */
const STILL_FRAME = 2;

/**
 * The paper the demo publishes, then rates: a real record on the staging graph whose signature
 * checks out, the same as the example asset further down the home page, and its staging
 * rating's score.
 */
const PAPER = {
  title:
    "Emerging trends in nanomedicine: The role of RNAi-based therapies and onpattro's clinical journey",
  pdf: "ipfs://bafybeia54htwu…sp5sfhgi",
  ual: "did:dkg:base:84532/0xd701…13b3/7",
  score: 67,
} as const;

/** What the asset's row says before the mint gives it a UAL. */
const PENDING: Partial<Record<PaperStage["stage"], string>> = {
  reading: "Given once minted",
  saving: "Given once minted",
  minting: "Minting on Base…",
};

const TABS = [
  { flow: "publish", label: "Publish", status: "live" },
  { flow: "rate", label: "Rate", status: "phase 1 live" },
] as const;

function framesOf(flow: Flow): number {
  return flow === "publish" ? PUBLISH_LOOP.length : RATE_FRAMES;
}

/**
 * The home page hero's demo: a paper is published, then rated, on a loop. Its tabs pick one
 * flow, which then loops on its own. Each flow ends on its result, the paper's UAL or its
 * score. Still at the mint for visitors who ask for reduced motion.
 */
export function ChainDemo() {
  const [flow, setFlow] = useState<Flow>("publish");
  const [frame, setFrame] = useState(0);
  /** Whether the demo moves on to the other flow; a tab's pick stops it. */
  const [tour, setTour] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (still) return;
    const last = frame === framesOf(flow) - 1;
    const timer = setTimeout(
      () => {
        if (!last) return setFrame(frame + 1);
        setFrame(0);
        if (tour) setFlow(flow === "publish" ? "rate" : "publish");
      },
      last ? STEP_MS * HOLD_STEPS : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [flow, frame, tour, still]);

  const pick = (next: Flow) => {
    setTour(false);
    setFlow(next);
    setFrame(0);
  };
  const shown = still ? STILL_FRAME : frame;

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Flow"
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
        >
          {TABS.map((tab) => (
            <button
              key={tab.flow}
              type="button"
              role="tab"
              id={`demo-tab-${tab.flow}`}
              aria-selected={flow === tab.flow}
              aria-controls="demo-panel"
              onClick={() => pick(tab.flow)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                flow === tab.flow
                  ? "bg-surface-strong font-medium text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs text-accent">
          {TABS.find((tab) => tab.flow === flow)?.status}
        </span>
      </div>
      <div
        role="tabpanel"
        id="demo-panel"
        aria-labelledby={`demo-tab-${flow}`}
        className="grid gap-5"
      >
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-strong/60 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted">
            <FilePdf aria-hidden size={20} />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="line-clamp-2 text-sm font-medium">{PAPER.title}</p>
            {/* A span: globals.css's `p { text-wrap: pretty }` would undo `truncate`. */}
            <span className="block truncate font-mono text-xs text-muted">
              {flow === "publish" ? PAPER.pdf : PAPER.ual}
            </span>
          </div>
        </div>
        {/* Both flows share one grid cell, the hidden one invisible, so the panel keeps the
            taller one's height and the hero beside it never jumps when the demo switches. */}
        <div className="grid">
          {(["publish", "rate"] as const).map((each) => (
            <div
              key={each}
              aria-hidden={each !== flow}
              inert={each !== flow}
              className={`grid gap-5 [grid-area:1/1] ${each === flow ? "" : "invisible"}`}
            >
              {each === "publish" ? (
                <Publish frame={each === flow ? shown : STILL_FRAME} />
              ) : (
                <Rate frame={each === flow ? shown : STILL_FRAME} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Publish({ frame }: { frame: number }) {
  const stage = PUBLISH_LOOP[frame] ?? "minting";
  const minted = stage === "published";
  return (
    <>
      <ProgressChain stage={stage} />
      <Result label="Knowledge Asset (UAL)" done={minted}>
        {minted ? PAPER.ual : PENDING[stage]}
      </Result>
    </>
  );
}

function Rate({ frame }: { frame: number }) {
  const done = frame >= RATING_STEPS.length;
  return (
    <>
      <StepChain
        label="Rating steps"
        steps={RATING_STEPS}
        done={frame}
        active={done ? undefined : frame}
      />
      <Result label="Reproducibility readiness" done={done}>
        {done ? (
          <>
            <span data-testid="demo-score">{PAPER.score}</span> / 100
          </>
        ) : frame === RATING_STEPS.length - 1 ? (
          "Recording on Base…"
        ) : (
          "Given once recorded"
        )}
      </Result>
    </>
  );
}

/** The flow's result: dashed while it runs, in the on-chain teal once it is there. */
function Result({
  label,
  done,
  children,
}: {
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid gap-1 rounded-xl border p-3 transition-colors duration-500 ${
        done ? "border-accent-2/40 bg-accent-2-soft" : "border-dashed border-line-strong"
      }`}
    >
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`truncate font-mono text-xs transition-colors duration-500 ${done ? "text-accent-2" : "text-muted"}`}
      >
        {children}
      </span>
    </div>
  );
}
