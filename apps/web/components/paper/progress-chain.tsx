import { Check, X } from "@phosphor-icons/react/dist/ssr";
import type { PaperStage } from "../../lib/publish/progress.ts";

/** A step of a chain, and the layer it acts on: a record off-chain, or an asset on-chain. */
export type ChainStep = {
  readonly label: string;
  readonly layer?: "off-chain" | "on-chain";
  readonly detail: string;
};

/** A paper's publish steps. */
const STEPS: readonly ChainStep[] = [
  { label: "Read", detail: "Title, authors and abstract taken from the PDF" },
  {
    label: "Saved",
    layer: "off-chain",
    detail: "The record is written to OriginTrail's knowledge graph",
  },
  {
    label: "Minted",
    layer: "on-chain",
    detail:
      "The asset is minted on Base by OriginTrail's Knowledge Asset contracts, with its merkle root",
  },
  { label: "Published", detail: "Anyone can check who submitted it" },
];

/** Classes per layer: blue for the off-chain record, teal for the on-chain asset. */
const TONE = {
  "off-chain": {
    text: "text-accent",
    fill: "bg-accent",
    soft: "bg-accent-soft",
    border: "border-accent",
  },
  "on-chain": {
    text: "text-accent-2",
    fill: "bg-accent-2",
    soft: "bg-accent-2-soft",
    border: "border-accent-2",
  },
} as const;

/** How many steps are done, and which one is being worked on, at each stage. */
function position(stage: PaperStage["stage"]): { done: number; active: number | undefined } {
  switch (stage) {
    case "reading":
    case "following":
      return { done: 0, active: 0 };
    case "saving":
      return { done: 1, active: 1 };
    case "minting":
      return { done: 2, active: 2 };
    case "published":
      return { done: 4, active: undefined };
    default:
      return { done: 0, active: undefined };
  }
}

/**
 * A paper's publish steps as a {@link StepChain}, a refused paper marked at Read, where every
 * refusal happens. `compact` shows a published paper's steps as one row of done steps,
 * without their details, so the page leads with the paper.
 */
export function ProgressChain({
  stage,
  compact = false,
}: {
  stage: PaperStage["stage"];
  compact?: boolean;
}) {
  if (compact) return <CompactChain />;
  return (
    <StepChain
      label="Publish steps"
      steps={STEPS}
      {...position(stage)}
      stopAt={stage === "refused" ? 0 : undefined}
    />
  );
}

/**
 * Steps as a vertical chain: the first `done` carry a check, the line into the `active` step
 * runs live and its node breathes, and the step at `stopAt` is marked with a cross. A done
 * line is blue, blue into teal from an off-chain step into an on-chain one, and teal between
 * two on-chain steps.
 */
export function StepChain({
  label,
  steps,
  done,
  active,
  stopAt,
}: {
  /** The list's accessible name. */
  label: string;
  steps: readonly ChainStep[];
  done: number;
  active: number | undefined;
  stopAt?: number | undefined;
}) {
  return (
    <ol aria-label={label} className="relative grid gap-6">
      {steps.map((step, index) => {
        const isDone = index < done;
        const isActive = index === active;
        const isStop = index === stopAt;
        const lineLive = index + 1 === active;
        const tone = TONE[step.layer ?? "off-chain"];
        const next = steps[index + 1];
        /** The line from an off-chain save into an on-chain mint shows the link between them. */
        const linkLine = step.layer === "off-chain" && next?.layer === "on-chain";
        const chainLine = step.layer === "on-chain" && next?.layer === "on-chain";
        return (
          <li key={step.label} className="relative grid grid-cols-[2rem_1fr] gap-4">
            {next && (
              <span
                aria-hidden
                className={`absolute top-8 bottom-[-1.5rem] left-[15px] w-0.5 rounded-full ${
                  lineLive
                    ? "line-live"
                    : isDone
                      ? linkLine
                        ? "link-gradient"
                        : chainLine
                          ? "bg-accent-2"
                          : "bg-accent"
                      : "bg-line-strong"
                }`}
              />
            )}
            <span
              className={`relative grid size-8 place-items-center rounded-full border transition-colors duration-500 ${
                isStop
                  ? "border-danger/50 bg-danger-soft text-danger"
                  : isDone
                    ? `border-transparent ${tone.fill} text-accent-ink`
                    : isActive
                      ? `step-active ${tone.border} ${tone.soft} ${tone.text}`
                      : "border-line-strong bg-page text-muted"
              }`}
            >
              {isStop ? (
                <X size={14} weight="bold" />
              ) : isDone ? (
                <Check size={14} weight="bold" />
              ) : (
                <span
                  className={`size-2 rounded-full ${isActive ? tone.fill : "bg-line-strong"}`}
                />
              )}
            </span>
            <div className="pt-0.5">
              <p
                className={`font-medium transition-colors duration-500 ${isDone || isActive ? "text-ink" : "text-muted"}`}
              >
                {step.label}
                {step.layer && <span className={tone.text}> {step.layer}</span>}
                {isActive && <span className="sr-only"> (in progress)</span>}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Every step done, as a four-column stepper: a check per step on one line (blue, then blue
 * into teal from the save to the mint), each label under its check. Four columns
 * fit a phone, so the row never wraps.
 */
function CompactChain() {
  return (
    <ol aria-label="Publish steps" className="grid grid-cols-4 gap-2 text-sm">
      {STEPS.map((step, index) => {
        const tone = TONE[step.layer ?? "off-chain"];
        const next = STEPS[index + 1];
        const linkLine = step.layer === "off-chain" && next?.layer === "on-chain";
        return (
          <li key={step.label} className="relative grid content-start gap-2">
            {next && (
              <span
                aria-hidden
                className={`absolute top-[9px] right-0 left-7 h-0.5 rounded-full ${linkLine ? "signal-gradient" : "bg-accent"}`}
              />
            )}
            <span
              className={`grid size-5 place-items-center rounded-full ${tone.fill} text-accent-ink`}
            >
              <Check size={11} weight="bold" />
            </span>
            <span className="font-medium leading-snug text-ink">
              {step.label}
              {step.layer && <span className={`block ${tone.text}`}> {step.layer}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
