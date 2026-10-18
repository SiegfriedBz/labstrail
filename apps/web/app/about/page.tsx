import { ArrowSquareOut, GithubLogo, LinkedinLogo } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "../../lib/site.ts";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who builds VeriSci, where its records live, and how it differs from the 2020 SciFact model of the same name.",
  alternates: { canonical: "/about" },
};

/**
 * Who builds VeriSci and where its records live, with the code and the maintainer's profile,
 * so search engines and AI search can tell this VeriSci from AllenAI's 2020 SciFact model of
 * the same name (ADR 0040).
 */
export default function AboutPage() {
  return (
    <div className="grid gap-14 md:gap-20">
      <header className="grid max-w-[65ch] gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">About {SITE.name}</h1>
        <p className="text-lg leading-relaxed text-muted">{SITE.definition}</p>
        <Link href="/method" className="link w-fit">
          How the score works
        </Link>
      </header>

      <section aria-labelledby="who-title" className="grid gap-8 md:grid-cols-[1fr_1fr] md:gap-14">
        <div className="grid content-start gap-4">
          <h2 id="who-title" className="text-xl font-semibold tracking-tight">
            Who builds it
          </h2>
          <p className="max-w-[56ch] leading-relaxed text-muted">
            {SITE.maintainer.name} builds and runs {SITE.name}.
          </p>
          <ul className="grid gap-3 text-sm">
            <li>
              <a
                href={SITE.repo}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-2"
              >
                <GithubLogo aria-hidden size={18} />
                Source code on GitHub
                <ArrowSquareOut aria-hidden size={12} />
              </a>
            </li>
            <li>
              <a
                href={SITE.maintainer.linkedIn}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-2"
              >
                <LinkedinLogo aria-hidden size={18} />
                Profile on LinkedIn
                <ArrowSquareOut aria-hidden size={12} />
              </a>
            </li>
          </ul>
        </div>
        <div className="grid content-start gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Where the records live</h2>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            Each paper is a Knowledge Asset on the OriginTrail DKG, minted on Base, with its PDF on
            IPFS. Each rating's score is recorded by VeriSci's RatingController contract, and its
            answers go in a Knowledge Asset of their own.
          </p>
          <p className="max-w-[56ch] text-sm leading-relaxed text-muted">
            Everything runs on Base Sepolia, a testnet, until a way to pay for mainnet is in place.
            VeriSci pays the publishing fees, and a rating request costs only gas.
          </p>
        </div>
      </section>

      <section aria-labelledby="name-title" className="glass grid gap-3 rounded-2xl p-5 sm:p-6">
        <h2 id="name-title" className="font-semibold">
          Another VeriSci
        </h2>
        <p className="max-w-[70ch] text-sm leading-relaxed text-muted">
          A 2020 research model for checking scientific claims, built at the Allen Institute for AI
          with the SciFact dataset, is also called VeriSci. This site is a separate project.
        </p>
      </section>
    </div>
  );
}
