# packages/workflows

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters. See
`README.md` here.

- May import `@verisci/core`, `@verisci/env`, `@verisci/dkg` and `@verisci/contracts`.
- Orchestrate here; put the rules themselves in `core` so they stay pure and testable.
- Mock the adapters in tests.
- ADRs that govern workflows: Inngest functions live here and `web` only serves them
  (0003), every write converges (0007), mints are polled with `step.sleep` (0008), retries
  are spaced with `step.sleep` (0009), the backend's oracle transactions go only through
  the oracle function, which checks receipts in later steps (0019), one singleton run per
  request (0020), the scorer's output contract (0018), a publish run is a singleton per
  CID and keeps a KA's first submitter (0010), a refused file is unpinned only if it is not
  a PDF (0010, 0005), local rating runs target a contract on Anvil (0036). The rating run
  also applies: a rating is its own R-KA (0011), phases settled by the oracle (0012), the
  contract owns scores and the DKG content (0014), requests free and throttled on testnet
  (0015), the R-KA named from the request id (0016), events taken at least once (0017), a
  fix is a redeploy, so past contracts are still served (0023), canonical UALs (0031),
  only life-science and health papers rated (0037).
  See [`docs/adr/`](../../docs/adr/README.md).
- Workflow logic takes its step tools and adapters as arguments (`PublishSteps`,
  `PublishDeps`, `RatingSteps`, `RatingDeps`, `OracleSteps`, `OracleChain`), so tests run
  it with fakes; `src/functions.ts` builds the real adapters
  on a function's first run. Never import `src/env.ts` from the main entry: `web` imports
  it, and `next build` must pass with only `APP_ENV` set.
- Step ids are unique per run (`read-1`, `wait-1-3`, `poll-1-3`); every wait is a
  `step.sleep`, never a sleep inside a step.
- Adapters return typed results and never throw for an expected failure, as ADR 0021
  asks of server reads. A run throws `NonRetriableError` only when its settings or
  its invocation's data are invalid (`loadDeps`, `loadRatingDeps`, the oracle's `setup`),
  when the node or GROBID refuses our credential or Gemini the request, when the node does
  not serve the graph, when a minted R-KA's score does not parse (`rating-unreadable`),
  when the oracle function fails or finds the request fulfilled with another R-KA
  (`oracle-failed`, `oracle-conflict`), and when its attempts or budget run out; its message starts `publish-failed:<reason>:` (`PublishFailure`, which the paper's
  page reads), `rating-failed:<reason>:` (`RatingFailure`) or `oracle-failed:<reason>:`
  (`OracleFailure`). A deployed server checks the settings at start too
  (`apps/web/instrumentation.ts`).
- Step outputs are kept as JSON: no `bigint` in a step's result (the oracle keeps fees as
  decimal strings). Tests' fake steps round-trip each output through JSON to catch it.
