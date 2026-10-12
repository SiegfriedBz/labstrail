# apps/web

Next.js 16 App Router app. See `README.md` here for scripts and status.

- May import all five `@verisci/*` packages; each must be listed in `transpilePackages`
  in `next.config.ts`, or the import fails at build time.
- Server-only code (secrets, `@verisci/env`, adapters) stays in server components, route
  handlers or server actions, never in a `"use client"` file.
- Env files live at the repo root, never in `apps/web`; `next.config.ts` loads them,
  and editing one needs a dev server restart. Never read them (see the root
  `CLAUDE.md` hooks).
- Vitest runs in `jsdom` here. `pnpm --filter @verisci/web typecheck` runs `next typegen`
  first; `next-env.d.ts` is generated, never edit it.
- Server reads and actions return typed results: never throw an expected failure to the
  client, never swallow it into empty data
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)).
- Inngest functions live in `@verisci/workflows`; `web` only serves them
  ([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).
- Components are grouped by area: `components/site` (the shell every page shares: logo,
  header links, theme button, footer, breadcrumbs), `wallet` (providers and button),
  `home`, `papers` (the list), `paper` (one paper's page), `publish`, and `ui` (shadcn
  primitives, restyled with `globals.css`'s tokens). A component another area reuses stays
  in its own area; a test sits next to its component.
- Playwright end-to-end tests come in a later plan; until then, cover logic in unit tests.
  Put a flow's logic in `lib/` with its IO passed in (`publishFile`, `paperProgress`,
  `requestUploadUrl`), and keep components and `app/actions.ts` thin.
- `lib/` is grouped by flow like `components/`: `lib/publish/` and `lib/papers/`; only
  helpers several areas share (`web-env`, `server`, `site`, `theme`, `shorten`, `utils`,
  `empty-module`) sit at its root. `lib/layout.test.ts` fails on a `.ts` or `.tsx` file
  anywhere else, so a new flow adds its folder there.
- Styling is Tailwind v4 with the tokens and classes in `app/globals.css` (`glass`,
  `signal-gradient`, `link`, `text-muted`, `text-accent`…): light (the default) and dark
  themes, so every colour is a token defined for both (`<html data-theme>`), never a raw
  colour. Teal marks on-chain assets only; blue marks off-chain records and is the
  brand's accent: the logo, the main action, focus rings, `link` underlines, the current
  page, and live or connected states. `rounded-2xl` panels, `rounded-xl` buttons and
  inputs, `rounded-lg` small controls, `rounded-md` flags. Check every page in both themes
  at 360, 768 and 1280 px with no horizontal scroll. Page copy follows the
  `design-taste-frontend` and humanizer skills: plain words, no em dashes.
- Wallet hooks (wagmi, AppKit) run only under `Providers` with a project id: render them
  behind `useWalletReady()`. Never pass server-only values to a client component except as
  plain props; client components never import `@verisci/workflows` at runtime (types only).
- Reads the page polls are route handlers, not server actions: Next runs server actions
  one at a time per client.
- A page reads the node on the server, in an async component inside `Suspense` with a
  skeleton shaped like the result (`PapersResults`, `PaperLoader`); what is known already
  shows in the skeleton. Check a 404 before the boundary when you can: `notFound()` inside it
  gives a 200 with `noindex`, since the response is already streaming.
- Tables are TanStack Table v9 over shadcn's table (`components/ui/table.tsx`): the server
  sorts and pages, columns and features are module constants (`papers-columns.tsx`), and
  rows arrive as props. Strings a server component needs from a client file go in a plain
  module (`components/paper/labels.ts`): a `"use client"` file's exports reach the server
  as client references.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
