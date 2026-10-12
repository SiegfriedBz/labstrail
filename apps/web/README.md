# @verisci/web

The Next.js 16 app (App Router).

Status: the home page; the upload pages, where a visitor connects a wallet, publishes a PDF,
follows it until its Target KA is minted and verifies its record; the list of published
papers; and `/api/inngest`, which serves the workflows' Inngest functions
([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).

Architecture views: [`.omm/overall-architecture/web-app/`](../../.omm/overall-architecture/web-app/), [`.omm/route-page-map/`](../../.omm/route-page-map/), [`.omm/state-transitions/paper-page/`](../../.omm/state-transitions/paper-page/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

All five packages: `@verisci/env`, `@verisci/core`, `@verisci/dkg`,
`@verisci/contracts`, `@verisci/workflows`. Each one must be listed in
`transpilePackages` in `next.config.ts`. Also `inngest` (the `/api/inngest` route's `serve`
handler); Reown AppKit, wagmi, viem and TanStack Query (the wallet); `@upstash/ratelimit`
and `@upstash/redis` (the limits); Zod (settings and run outputs); `@next/env` (loads the
root env files in `next.config.ts`); TanStack Table (the papers table); Tailwind CSS, with
`clsx` and `tailwind-merge` for shadcn's `cn` (`lib/utils.ts`); and Phosphor icons. `next.config.ts`
points the optional `@x402/*` packages, reached through wagmi's connectors, at
`lib/empty-module.ts` (`docs/domain.md` → Next.js).

## Pages and routes

| Path | What it is |
| --- | --- |
| `/` | Home: what VeriSci does, the latest papers (the five newest, streamed in with a skeleton, linking to `/papers`), the DKG's two layers (the record off-chain, its ERC-721 token and merkle root on-chain, the UAL linking them), how publishing works and the rating flow to come, and an example paper asset |
| `/publish` | Connect a wallet, drop a PDF, sign once; what publishing means and the limits ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md), [ADR 0034](../../docs/adr/0034-users-connect-a-wallet-anyone-may-publish.md)) |
| `/papers?page=<n>` | Every paper this environment published, newest mint first, 20 to a page (below) |
| `/papers/<cid>?event=<id>` | Where a paper stands, then its record, abstract and how to verify it (below), under "Papers / <title>" breadcrumbs. `?already=1` says a re-submitted PDF was already published |
| `/api/papers/<cid>?event=<id>` | The same as JSON (`PaperView`: the stage, and the record once published), never cached: a read, so a route rather than a server action |
| `/api/inngest` | Serves the Inngest functions: the publish function, plus the rating and oracle functions where the oracle key is set |
| any other path | `app/not-found.tsx`; a page that fails to render shows `app/error.tsx` with a retry |

The publish form calls two server actions (`app/actions.ts`): `requestUpload()` signs a
Pinata upload URL within the connection's daily limit, and `submitPaper(input)` checks the
signed submission and starts its publish run within the address's daily limit
([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)). The browser
(`lib/publish/publish-flow.ts`) first refuses a file that is not a PDF (by its type, or, when the
picker gives none, by the `%PDF-` it must start with) or is over 15 MB, before spending an
upload URL. It then uploads the PDF straight to Pinata, canonicalizes the CID it answers,
and has the wallet sign `{ cid, contextGraph, deadline }` with a deadline 10 minutes ahead.
The work itself is `@verisci/workflows`' `getUploadService()`
([`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)).

Limits (`lib/publish/limits.ts`): 10 upload URLs per connection (IP) and 5 submissions per signing
address, each per rolling day, in Upstash; in memory with `APP_ENV=local` and no Upstash
settings, reset when the server restarts. A limit store that does not answer refuses
rather than letting requests through.

A service that does not answer gives the visitor "A service we rely on didn't answer", and
the server logs one warning naming it: `upload-url-unavailable: <service>: <what came back>`
(`upstash`, `pinata`) for an upload URL, `submit-unavailable: …` for a submission
([`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)). The line never
carries a key or a URL.

### The papers list

`/papers` reads one page from the DKG node per request (`listPapers`,
[`packages/workflows`](../../packages/workflows/README.md#the-pages-calls)), with no database
([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)): the papers newest mint
first, the total, each paper's first three authors (or how many it has, when none could be
named) and its signature check. The heading
shows at once and the rows stream into a `Suspense` boundary keyed by page, with a skeleton
shaped like the table (`components/papers/papers-table-skeleton.tsx`).

- The table (`components/papers/papers-table.tsx`) is TanStack Table v9 with core features
  only, since the server sorts and pages; its columns are module constants
  (`papers-columns.tsx`), drawn with shadcn's table restyled with the app's tokens
  (`components/ui/table.tsx`). Below `md`, each row is one stacked cell.
- Page links (`components/papers/pager.tsx`) are plain links to `/papers?page=N`, so each page
  is a URL the server renders: the first, the last and the current page's neighbours past
  seven pages.
- A `?page=` that is not a positive whole number, or one so far out that page × 20 passes
  `Number.MAX_SAFE_INTEGER`, answers 404 before anything streams. A page past the last shows
  the not-found page, as a 200 with `noindex`, since the response is already streaming when
  the node answers (`docs/domain.md` → Next.js).
- A node that does not answer says the list can't be loaded, with a link to try again; an
  answer that can't be read (a refused query, or a page the total covers with no readable
  row) says so, without the link. On the home page, the latest papers block says it can't
  load them in either case, and only that block
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).

### The paper page

The server reads where the paper stands (`components/paper/paper-loader.tsx`, the same
`readProgress` as `/api/papers/<cid>`) inside a `Suspense` boundary. Until the node answers,
a skeleton shows the breadcrumbs, the side panel's real heading, groups and labels, and the
PDF's CID, with only the values pulsing: the chain of steps and the publish panel's labels
when the address has `?event=`, a published paper's shape (abstract, one row of steps) and
the verify panel's otherwise (`components/paper/labels.ts` holds the labels both use).
`components/paper/paper-progress.tsx` then follows the paper from that first view: unless it
is final, it asks `/api/papers/<cid>` every 5 s and stops on a final stage. It shows and asks
by the CID's canonical spelling, the one the signature covers, whatever spelling the address
has. `lib/publish/progress.ts` (`paperProgress`, pure) maps the
asset's state on the node, the run Inngest started for the event, and why that run stopped
to one stage:

```mermaid
stateDiagram-v2
  [*] --> reading: event sent
  reading --> saving: draft on the node
  saving --> minting: shared, mint started
  minting --> published: asset minted
  reading --> refused: the paper cannot be published (why)
  reading --> failed: the run stopped (why)
  saving --> failed
  minting --> failed
  reading --> following: no run a minute after the event
  following --> saving: the other run stores it
  following --> not_found: nothing stored after 45 minutes
  reading --> not_found: still listed as running, nothing stored, after an hour
  reading --> not_published: run ended, output unreadable, nothing stored
  published --> [*]
  refused --> [*]
  failed --> [*]
  not_found --> [*]
  not_published --> [*]
```

- A minted asset is `published` whatever the run says, so a second submitter of the same
  PDF sees it at once.
- `refused` shows why (`lib/publish/messages.ts` → `refusalMessage`): not a PDF, too large,
  unreadable, no title or no text (with a hint for PDFs whose pages are pictures), a paper
  outside the field (VeriSci publishes life-science and health papers only, the field named
  as [ADR 0037](../../docs/adr/0037-verisci-rates-life-science-and-health-papers.md) names
  it), or a submission that failed its checks.
- `failed` shows why the run stopped (`failureMessage`): Base, the PDF, the DKG node or
  the mint not answering after every retry, or a problem on our side.
- `following`: the event started no run a minute after it was sent (its time is read from
  its ULID, `eventTime`). The publish function is a singleton per CID, so another run holds
  this PDF; the page follows the paper on the node and gives up (`not-found`) after
  `FOLLOW_MS`, a run's whole 45-minute budget.
- `not-found` also covers a page with no event to ask about and nothing on the node, and a
  run still listed as running an hour after its event with nothing on the node
  (`STALE_RUN_MS`: the run's budget, which counts from its start, plus a margin for a late
  start); Inngest has cancelled it by then.
- `unavailable` (the node or Inngest not answering) is shown and asked again.
- A published paper whose record the node did not answer for, or does not show yet after
  its run minted it (`recordProblem: "unavailable"`), is asked about again until the record
  loads; one whose record cannot be read says so
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).

Once published, the page leads with the paper: the record (title, sized by its length,
authors, DOI), then its abstract (`components/paper/abstract.tsx`: past 420 characters, cut
to five lines with a "Read more" toggle), then the publish steps as one row of done steps.
Beside it, a "Verify it yourself" panel (`components/paper/verify-panel.tsx`) shows the
signature checked when read, then two groups: "The submission" (the submitter, the
signature, its deadline and the context graph) and "The asset" (the agent address the asset
is minted to, which is our node and the UAL's author; the asset's ERC-721 token in
OriginTrail's `DKGKnowledgeAssets`, `lib/papers/explorer.ts` → `assetTokenUrl`; the UAL; and the
PDF's CID, linked through Pinata's public gateway, `ipfsUrl`, since ipfs.io no longer
serves files). Addresses and the token link to Basescan. "How to check this record" gives
the EIP-712 domain and type to check the signature with.

## Code layout

- `app/`: the pages, the route handlers and the server actions.
- `lib/`: each flow's logic, pure or with its IO passed in, tested in unit tests, in the
  flow's folder: `publish` (the upload, the publish form's steps, a paper's progress, the
  messages and the limits) and `papers` (the list and explorer links). Only helpers several
  areas share sit at its root: `web-env`, `server`, `site` (the name and description the
  metadata, the footer and the wallet window read), `theme`, `shorten`, `utils` and
  `empty-module`.
- `components/`, grouped by area: `site` (the shell every page shares: logo, header links,
  theme button, footer, breadcrumbs), `wallet` (the wallet providers and button),
  `home`, `papers` (the papers list), `paper` (one paper's page), `publish`, and `ui`
  (shadcn primitives, restyled with the app's tokens). Tests sit next to their component.

## Design

The "Clinical" look: a clinical record with an on-chain proof, in Tailwind CSS v4 (`app/globals.css`):

- Two themes: light by default, dark once the visitor picks it with the sun and moon button
  in the header; the choice is kept in this browser (`localStorage`). `THEME_SCRIPT`
  (`lib/theme.ts`) sets `<html data-theme>` in `<head>` before the first paint, so no page
  flashes the other theme, and Tailwind's `dark:` variant follows that attribute. The
  button's name is the same in both themes and CSS picks its icon, so it is right before
  JavaScript runs. AppKit's wallet window follows the same theme. Every colour is a token
  defined for both themes: light accents are dark enough for AA text contrast, and dark is
  a deep blue-grey with solid panels one step lighter than the page. `app/globals.test.ts`
  reads both themes' tokens and holds text to WCAG AA (4.5:1 on the page for ink, muted,
  both accents and danger, accent text on its fill, white on `accent-deep`).
- The "Clinical" look: a cool off-white page (deep blue-grey in dark), a soft wash across
  the top of each page (blue from the top left, teal from the top right), one soft glow
  behind the hero. Raised panels
  with hairline borders hold figures, tools, tables and lists: the hero's publish flow, the
  UAL figure, the example asset, the papers table and its messages, the paper page's verify
  and publish panels, the publish form and the footer's contracts. Elsewhere, coloured
  edges, timelines and hairline rules group the content, with one call to action per page.
- Two signal colours with one meaning each: blue for the off-chain record, teal for the
  on-chain asset. They blend only on the logo, the main action, live lines, and the line
  linking a save to its mint in the publish chain. Text links are ink with a blue underline
  (`link`); addresses in the papers list and the footer's contract links are muted and
  turn teal on hover. The header's wallet button is neutral, so each page's own call to
  action leads.
- Sora for text, Martian Mono for on-chain values (`next/font`), Phosphor icons. One radius
  scale: `rounded-2xl` panels, `rounded-xl` buttons and inputs, `rounded-lg` small
  controls, `rounded-md` flags.
- The hero's panel plays the publish flow on a loop: the example paper's PDF goes in, the
  steps run, and its UAL comes out once minted (`components/home/chain-demo.tsx`). The
  example is a real staging record whose signature checks out, the same as the example
  asset lower on the page. Beside "Publish a paper", a "Browse papers" link.
- Motion: the hero's publish flow loops and the step being worked on breathes; the home
  sections after the hero rise in as they enter the screen (`reveal`, a CSS scroll-driven
  animation, where the browser supports one). All of it stops for visitors who ask for
  reduced motion.
- Every page works from 360 px wide, one column on phones, and the page clips any overflow
  (`overflow-x: clip`, which keeps the sticky header working). The home hero fills the
  first screen, so the next section starts below the fold; below `md`, the hero's text
  fills the first screen and its panel starts just under the fold. On-chain values show in
  short form with a copy button.
- The product name is VeriSci, for life-science and health papers; its name and description
  come from `lib/site.ts` (`SITE`). Its mark (`components/site/logo.tsx`, and `app/icon.svg`
  for the tab, in fixed colours that read on light and dark tabs) is a heartbeat whose last
  beat is a check, drawn from the record's blue into the proof's teal.
- Keyboard users get a skip link and one accent focus ring; the header underlines the
  current page's link in blue. On phones the wallet button is a wallet icon (with a dot
  once connected) beside the theme button, so the header keeps one line; once connected it
  is named by the short address it shows, and AppKit's own window opens from it.
- What the DKG node answers loads behind a skeleton shaped like what replaces it, streamed
  in a `Suspense` boundary; what is known already (labels, the CID) shows at once.
- The footer (`components/site/site-footer.tsx`) lists the contracts on Base Sepolia, linked on
  Basescan: OriginTrail's `DKGKnowledgeAssets` and `KnowledgeAssetsLifecycle`
  (`ORIGINTRAIL_CONTRACTS` from `@verisci/core`), and this environment's RatingController
  from `@verisci/contracts` (`local` shows staging's).

## Environment

`next.config.ts` loads env files from the repo root (`.env.local` and friends; see
[`.env.example`](../../.env.example)). Keep them there, not in `apps/web`: Next.js
would mix the two unpredictably when it reloads. Next.js only watches `apps/web`,
so restart `pnpm dev` after editing a root env file. Variables already set in the
environment (CI, the host) take precedence.

Its own settings are declared in `lib/web-env.ts` (`createWebEnv`), all three required
unless `APP_ENV` is `local`:

| Variable | Value |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis's REST address and token, for the limits: one database per environment, previews using staging's ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). The token is secret |
| `REOWN_PROJECT_ID` | The Reown project id for the wallet window, from one project shared by every environment, read on the server and handed to the page, so nothing is inlined at build time. Without it the pages say the wallet is not set up |

The pages also need the workflows' settings (DKG, Pinata, chain, Gemini, Inngest;
[`packages/workflows`](../../packages/workflows/README.md#environment)). With
`APP_ENV=local`, `/api/inngest` and the upload page talk to the Inngest dev server.
`instrumentation.ts` checks the workflows' and the web app's settings when a deployed server
starts, so a bad one stops it there; it checks the rating settings too in production, which
refuses to start without its oracle key, and on staging when the key is set
([`packages/workflows`](../../packages/workflows/README.md#environment),
[ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)). It checks nothing when `APP_ENV` is `local`, and does
not run during `next build`. On Vercel, a server starts on a request after the deploy is
live, so a missing setting makes every route fail: set them in each Vercel environment
before its first deploy, and allow each deployed domain in the Reown project.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/web dev` | Starts the dev server on http://localhost:3000 |
| `pnpm --filter @verisci/web build` | Production build; needs `APP_ENV` (from the root `.env.local` locally) |
| `pnpm --filter @verisci/web start` | Serves the production build |
| `pnpm --filter @verisci/web inngest` | Starts the Inngest dev server (http://localhost:8288), pointed at `/api/inngest`; run it next to `dev` |
| `pnpm --filter @verisci/web typecheck` | Generates Next's types (`next typegen`), then runs `tsc` |
| `pnpm --filter @verisci/web test` | Runs its Vitest project (`vitest run`) |
