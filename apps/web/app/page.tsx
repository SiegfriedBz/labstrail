import {
  ArrowRight,
  Cube,
  FilePdf,
  Flask,
  Graph,
  PenNib,
  Robot,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Suspense } from "react";
import { ChainDemo } from "../components/home/chain-demo.tsx";
import { LatestPapers } from "../components/home/latest-papers.tsx";
import { PapersTableSkeleton } from "../components/papers/papers-table-skeleton.tsx";
import { LATEST_PAPERS } from "../lib/papers/papers.ts";

const HOW = [
  {
    icon: Wallet,
    title: "Connect your wallet",
    body: "Your address becomes the submitter on the record.",
  },
  {
    icon: FilePdf,
    title: "Drop your PDF",
    body: "It's stored on IPFS. We read its title, authors and abstract, and check it's a life-science or health paper.",
  },
  {
    icon: PenNib,
    title: "Sign once",
    body: "Signing is free and sends no transaction. We mint the record and pay its fees.",
  },
] as const;

const RATE = [
  {
    icon: Robot,
    title: "Reproducibility readiness",
    body: "An AI model reads the whole paper and checks, against the checklist for its kind of study, whether it gives what others need to check and reproduce the work. The score, from 0 to 100, goes on-chain, the answers and quotes into the rating's asset. It doesn't say whether the results hold, and it can't catch a made-up paper that states every right thing.",
  },
  {
    icon: UsersThree,
    title: "Human review",
    body: "Reviewers, drawn at random with Chainlink VRF so anyone can check the draw was fair, read the paper and score it. Their score is recorded next to the first one, which stays as it was.",
  },
  {
    icon: Flask,
    title: "Wet-lab replication",
    body: "A lab repeats the experiments, then reviewers check its results. That verdict is recorded as a third score, next to the first two.",
  },
] as const;

/** The example UAL of the "What a paper asset holds" card, split into what each part names. */
const UAL_PARTS = [
  { value: "did:dkg:base:84532", label: "chain: Base Sepolia" },
  { value: "0xd701…13b3", label: "publisher: VeriSci's node" },
  { value: "7", label: "asset number" },
] as const;

const HOLDS = [
  {
    term: "The token",
    detail: "Held by VeriSci's node, which publishes the asset and pays its fees.",
  },
  {
    term: "Your claim",
    detail: "Your signature inside the asset, covered by the merkle root.",
  },
  {
    term: "The PDF",
    detail: "On IPFS, addressed by its CID, computed from its bytes.",
  },
] as const;

/** The example asset: the staging record also in the hero's demo, its signature valid. */
const RECORD = [
  [
    "title",
    "Emerging trends in nanomedicine: The role of RNAi-based therapies and onpattro's clinical journey",
  ],
  ["authors", "Dilpreet Singh, Satvir Singh, Nitin Tandon, …"],
  ["pdf", "ipfs://bafybeia54htwu…sp5sfhgi"],
  ["submitter", "0x9a17…9111"],
  ["signature", "0xd116…7f1c (EIP-712)"],
  ["deadline", "1791639437 (Unix seconds)"],
] as const;

/**
 * Home: what VeriSci does, the latest published papers, the way to publish, and the rating
 * flow to come. The latest papers stream in, so the hero never waits for the DKG node.
 */
export default function Home() {
  return (
    <div className="grid gap-24 sm:gap-32">
      {/* The first screen, below the header and the page's top padding, so no section is cut
          at the fold: text and panel side by side from md; below it, the text fills the first
          screen and the panel starts just under the fold. */}
      <section className="grid items-center gap-10 md:min-h-[calc(100dvh-8rem)] md:grid-cols-[1.3fr_1fr] md:content-center md:gap-14">
        <div className="enter grid min-h-[calc(100dvh-6.5rem)] content-center gap-7 sm:min-h-[calc(100dvh-8rem)] md:min-h-0">
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-[2.75rem] lg:text-5xl">
            Publish your life-science paper as a record anyone can{" "}
            <span className="text-accent">verify</span>
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
            For research in biology, medicine and health. Drop a PDF and sign with your wallet.
            VeriSci records it on the knowledge graph, with you as its submitter.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/publish"
              className="signal-gradient inline-flex w-fit items-center gap-2 rounded-xl px-5 py-3 font-semibold text-accent-ink shadow-glow transition hover:brightness-110 active:scale-[0.98]"
            >
              Publish a paper
              <ArrowRight size={18} weight="bold" />
            </Link>
            <Link href="/papers" className="link">
              Browse papers
            </Link>
          </div>
        </div>
        <div className="enter-late relative">
          <div aria-hidden className="signal-glow absolute -inset-x-4 -inset-y-10 sm:-inset-10" />
          <figure className="glass relative grid gap-5 rounded-2xl p-6 sm:p-7">
            <figcaption className="flex items-center justify-between gap-3 text-sm text-muted">
              <span>Publish flow</span>
              <span className="font-mono text-xs text-accent">live</span>
            </figcaption>
            <ChainDemo />
          </figure>
        </div>
      </section>

      <section className="reveal grid gap-6" aria-labelledby="latest-papers">
        <div className="grid max-w-[62ch] gap-3">
          <h2 id="latest-papers" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Latest papers
          </h2>
          <p className="leading-relaxed text-muted">
            The newest records on the knowledge graph. Open one to check who submitted it.
          </p>
        </div>
        <Suspense fallback={<PapersTableSkeleton rows={LATEST_PAPERS} />}>
          <LatestPapers />
        </Suspense>
      </section>

      <section className="reveal grid gap-8">
        <div className="grid max-w-[62ch] gap-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Two layers, one record
          </h2>
          <p className="leading-relaxed text-muted">
            VeriSci publishes each paper on the OriginTrail Decentralized Knowledge Graph (DKG) as a
            Knowledge Asset: a set of linked statements about the paper, with an owner and a proof
            on-chain. Its content and its proof live in two places that check each other.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <article className="grid content-start gap-2 border-l-2 border-accent pl-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <Graph size={20} className="shrink-0 text-accent" />
              The content, off-chain
            </h3>
            <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
              DKG nodes store the asset's statements: title, authors, the PDF's link, the submitter,
              their signature and its deadline. Once published, OriginTrail replicates them across
              the context graph's nodes, and any node subscribed to VeriSci's graph can fetch them
              by the UAL, the asset's permanent address.
            </p>
          </article>
          <article className="grid content-start gap-2 border-l-2 border-accent-2 pl-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <Cube size={20} className="shrink-0 text-accent-2" />
              The owner and the proof, on-chain
            </h3>
            <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
              Publishing mints the asset on Base as an ERC-721 token and anchors the merkle root of
              its statements, one hash computed from all of them. Any node can check that the
              content still matches that root. Only the token's holder can update the asset, and
              each update anchors a new root under the same UAL.
            </p>
          </article>
        </div>
        <figure className="glass grid gap-5 rounded-2xl p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start md:gap-8">
            <figcaption className="text-sm font-semibold md:pt-1">
              The UAL links both layers
            </figcaption>
            <div className="grid gap-3">
              <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-2 font-mono text-xs">
                {UAL_PARTS.map(({ value, label }, index) => (
                  <li key={label} className="flex items-start gap-1.5">
                    <span className="grid gap-1">
                      <span className="w-fit rounded-md border border-line bg-surface-strong px-2 py-1 text-ink">
                        {value}
                      </span>
                      <span className="font-sans text-[11px] text-muted">{label}</span>
                    </span>
                    {index < UAL_PARTS.length - 1 && (
                      <span aria-hidden className="pt-1 text-muted">
                        /
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <Graph size={14} className="shrink-0 text-accent" />A node on VeriSci's graph
                  returns its statements
                </span>
                <span className="flex items-center gap-1.5">
                  <Cube size={14} className="shrink-0 text-accent-2" />
                  It also gives the ERC-721 token's id on Base
                </span>
              </div>
            </div>
          </div>
          <dl className="grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3 sm:gap-6">
            {HOLDS.map(({ term, detail }) => (
              <div key={term} className="grid content-start gap-0.5">
                <dt className="font-medium">{term}</dt>
                <dd className="leading-relaxed text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
        </figure>
      </section>

      <section className="reveal grid gap-10">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
        <div className="grid gap-16">
          <Track
            label="Publish"
            badge={<span className="text-accent">live</span>}
            intro="Three steps and one signature. No gas."
            steps={HOW}
          />
          <Track
            label="Rate"
            badge="coming soon"
            intro="Anyone will be able to ask for a rating of a published paper. The first score measures reproducibility readiness, not whether the work is right. Each phase records its own score on-chain, so earlier scores stay as they were."
            steps={RATE}
            muted
          />
        </div>
      </section>

      <section className="reveal grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
        <div className="glass order-2 overflow-hidden rounded-2xl md:order-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs text-muted">
            <span>Paper asset · stored off-chain</span>
            <span>Example</span>
          </div>
          <dl className="grid gap-3 p-5 font-mono text-xs sm:text-sm">
            {RECORD.map(([key, value]) => (
              <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                <dt className="text-muted">{key}</dt>
                <dd className="truncate text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-1 border-t border-line px-5 py-3 font-mono text-xs">
            <span className="text-muted">address (UAL)</span>
            <span className="truncate text-ink">did:dkg:base:84532/0xd701…/7</span>
          </div>
        </div>
        <div className="order-1 grid content-start gap-3 md:order-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What a paper asset holds
          </h2>
          <p className="max-w-[40ch] leading-relaxed text-muted">
            The statements DKG nodes store for each paper: its details, a permanent link to the PDF,
            and your signature. The merkle root on Base covers all of them, so anyone can check who
            submitted it without trusting us.
          </p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-muted">
            A rating will be a separate asset, with its own UAL, whose statements point to this one.
            The paper asset itself never changes.
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * One flow of "How it works": its name, a status, a line of context and its steps, as a
 * row joined by a line from `md` up and a vertical timeline below.
 */
function Track({
  label,
  badge,
  intro,
  steps,
  muted = false,
}: {
  label: string;
  badge: React.ReactNode;
  intro: string;
  steps: typeof HOW | typeof RATE;
  muted?: boolean;
}) {
  return (
    <div className="grid content-start gap-5">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-3 text-lg font-semibold">
          {label}
          <span className="rounded-md bg-surface-strong px-2 py-0.5 font-mono text-xs font-normal text-muted">
            {badge}
          </span>
        </h3>
        <p className="max-w-[52ch] text-sm leading-relaxed text-muted">{intro}</p>
      </div>
      <ol className="grid gap-7 md:grid-cols-3 md:gap-8">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li
            key={title}
            className="relative grid grid-cols-[2.5rem_1fr] items-start gap-4 md:grid-cols-1"
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-10 bottom-[-1.75rem] left-[19px] w-px md:top-5 md:right-[-1.5rem] md:bottom-auto md:left-12 md:h-px md:w-auto ${
                  muted ? "bg-line-strong" : "bg-accent/40"
                }`}
              />
            )}
            <span
              className={`relative grid size-10 place-items-center rounded-full border ${
                muted
                  ? "border-line-strong bg-page text-muted"
                  : "border-accent/40 bg-accent-soft text-accent"
              }`}
            >
              <Icon size={18} />
            </span>
            <div className="pt-1.5 md:pt-0">
              <h4 className={`font-medium ${muted ? "text-ink/80" : ""}`}>{title}</h4>
              <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
