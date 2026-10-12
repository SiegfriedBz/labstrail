# @verisci/workflows

Inngest workflows that combine `core` logic with the `dkg` and `contracts` adapters;
`apps/web` only serves them ([ADR 0003](../../docs/adr/0003-inngest-functions-live-in-workflows.md)).

Status: the publish run, which turns a pinned PDF into a minted Target KA, the calls the
upload page makes to start and follow it, and the papers list's read; the rating run, which
scores a requested paper and has the oracle record it, and the oracle function. Locally a
dev script starts the rating run; on staging, the Alchemy webhook will (next plan).

Architecture views: [`.omm/overall-architecture/workflows/`](../../.omm/overall-architecture/workflows/), [`.omm/pipeline/`](../../.omm/pipeline/) (`pnpm exec omm view --port 4000` shows them; root README → Architecture).

## Depends on

`@verisci/core`, `@verisci/env`, `@verisci/dkg`, `@verisci/contracts`; Inngest, viem
(signature checks, the rating contract, the oracle's transactions), Zod and unpdf (a PDF's
text, for the scorer and the field check). The scorer and the publish run's field check call
the Gemini API over `fetch` (`src/gemini/`), with no SDK.

## Environment

Declared in `src/workflows-env.ts`, extending the DKG node's settings
([`packages/dkg`](../dkg/README.md#environment)), and validated on first import of
`@verisci/workflows/env`, not of the main entry, which exports `createWorkflowsEnv` (it
validates only when called). The functions build their adapters on their first run, so
`web` serves them, and `next build` imports them, without any of these set. A deployed
server (`APP_ENV` other than `local`) checks them when it starts, through
`apps/web/instrumentation.ts`, and refuses to start on a bad one.

| Variable | Value |
| --- | --- |
| `GROBID_URL` | GROBID's base URL: `http://127.0.0.1:8070` locally ([`docs/node-host.md`](../../docs/node-host.md) → GROBID) |
| `PINATA_GATEWAY_URL` | The Pinata account's dedicated gateway, `https://<name>.mypinata.cloud`, through which the publish and rating runs read PDFs; one account serves every environment ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)) |
| `CHAIN_RPC_URL` | A Base Sepolia RPC URL, to check smart-contract wallets' signatures and, on staging and production, to read and write the rating contract |
| `PINATA_JWT` | A Pinata API key (JWT) allowed to upload, list and delete files; the `publish-pdf` dev script reads it too. Secret |
| `GEMINI_API_KEY` | A Gemini API key from Google AI Studio, for the publish run's field check ([ADR 0037](../../docs/adr/0037-verisci-rates-life-science-and-health-papers.md)) and the rating functions' scorer ([ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)); the `score-papers` dev script reads it too. Every deployment checks it at start, previews included. Secret |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Inngest's keys, required unless `APP_ENV` is `local`: the SDK reads them itself, and the signing key also reads runs for the upload page. Secret |
| `VERCEL_GIT_COMMIT_REF` | Set by Vercel: on staging, the branch, which names the Inngest branch environment runs are read from |

The rating functions read three more, declared in `src/rating-env.ts`
(`createRatingEnv`) and validated with the settings above in one pass, so one `EnvError`
names every bad variable. A deployment serves the rating and oracle functions only when
`ORACLE_PRIVATE_KEY` is set (`servesRating`); a deployed server checks these at start in
production, which refuses to start without the key, and on staging when the key is set
([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)).

| Variable | Value |
| --- | --- |
| `ORACLE_PRIVATE_KEY` | The oracle's key, `0x` and 64 hex: on Vercel only `develop` (staging's, scoped to that branch) and production hold one; locally, Anvil's second default account's key. Secret |
| `LOCAL_CHAIN_RPC_URL`, `LOCAL_RATING_CONTRACT` | Required only when `APP_ENV=local`: Anvil's URL (`http://127.0.0.1:8546`) and the RatingController deployed there ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)). Elsewhere the contracts come from the committed deployments file, current and past ([ADR 0028](../../docs/adr/0028-deployed-addresses-are-committed.md)) |

`DKG_CONTEXT_GRAPH` must spell its address in EIP-55 checksum case, as the node lists it
(`@verisci/dkg`'s rule): a query with the address in another case reads another, empty
graph, so the papers list would show none (`docs/domain.md` → DKG).

With `APP_ENV=local` the Inngest client sends events to the local dev server and the
upload page reads runs there, with no keys.

## API

| Export | What it does |
| --- | --- |
| `workflowsName` | The package name, imported by the web app's package test |
| `inngest` | VeriSci's Inngest client, in dev mode when `APP_ENV` is `local` |
| `functions`, `servedFunctions(runtimeEnv)` | The Inngest functions this deployment serves, for `web`'s `/api/inngest` route: the publish function, plus the rating and oracle functions when `ORACLE_PRIVATE_KEY` is set |
| `publishPaper` | The `publish-paper` function, run by `verisci/paper.submitted` |
| `ratePaper`, `oracleTransaction` | The `rate-paper` function, run by `verisci/rating.requested`, and the `oracle-transaction` function it invokes (below) |
| `RATING_REQUESTED`, `RatingRequested`, `ratingRequestedEvent(log)` | The rating event's name, `verisci/rating.requested`, its data `{ contract, requestId }`, and the event for a `Phase1Requested` log (id `rating:<request id>`), or `undefined` for any other log |
| `RATING_SETTINGS`, `ORACLE_SETTINGS` | The rating run's and the oracle function's limits (below) |
| `RatingOutcome`, `RatingFailure`, `ratingFailureReason(output)` | How a rating run ends (`fulfilled`, `cancelled` with an optional orphan R-KA, `skipped`), and why one stopped instead: each error it throws starts `rating-failed:<reason>:` |
| `OracleAction`, `OracleInput`, `OracleResult`, `OracleFailure` | What the oracle function is asked, what it answers, and why it stops (`oracle-failed:<reason>:`) |
| `createRatingEnv(runtimeEnv)`, `RatingEnv`, `checkRatingSettings(runtimeEnv)`, `ratingSettingsRequired(runtimeEnv)`, `servesRating(runtimeEnv)` | The rating settings and their type, the start check `apps/web/instrumentation.ts` runs, when it requires them, and whether a deployment serves the rating functions |
| `PAPER_SUBMITTED` | The event's name, `verisci/paper.submitted` |
| `PUBLISH_SETTINGS` | The publish run's limits (below) |
| `PublishOutcome`, `PaperRefusal`, `SubmissionRefusal` | How a run ends: `minted` with its UAL, or `refused` with why |
| `PublishFailure`, `publishFailureReason(output)` | Why a run stopped instead (`chain-unreachable`, `paper-unreachable`, `node-unreachable`, `mint-not-confirmed`, `setup`): each error it throws starts `publish-failed:<reason>:`, and the reader finds it in a failed run's output however Inngest nests it |
| `getUploadService()` | The pages' calls, built on first use from the settings: `contextGraph`, `createUploadUrl()`, `submitPaper(input, limiter)`, `readPaper(cid, eventId?)`, `listPapers({ page, pageSize })` (below) |
| `UploadService`, `PaperStatus`, `PublishedRecord`, `UPLOAD_SETTINGS` | Their type, what `readPaper` returns (the Target KA's state and the run), and the upload URL's and signature's lifetimes |
| `SubmitResult`, `SubmitRefusal`, `SubmitLimiter` | What `submitPaper` returns, why it refuses, and the per-submitter limit the web app passes it |
| `UploadUrlResult`, `ReadRunResult`, `RunState` | What `createUploadUrl` and the run read return |
| `PaperListResult`, `PaperSummary`, `SignatureCheck`, `QueryProblem` | What `listPapers` returns: a page of papers with the total, or why not (`unavailable`, `unreadable`); one listed paper; a signature check (`valid`, `invalid`, `unknown`) |
| `env` (from `@verisci/workflows/env`); `createWorkflowsEnv(runtimeEnv)`, `WorkflowsEnv` (from either entry) | The validated settings, the function that builds them from a given object, and their type |

## Publishing a paper

`verisci/paper.submitted` carries `{ cid, contextGraph, deadline, submitter, signature }`:
the PDF's CID (canonical CIDv1 base32), the context graph, a deadline in Unix seconds as a
decimal string, and the submitter's EIP-712 signature over the first three
([`packages/core`](../core/README.md#target-kas), [ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)).

The run is a singleton per CID in mode `skip`: a second event for a PDF being published
starts nothing. Its steps:

1. **verify**: the CID is canonical, the graph is this environment's, the deadline is ahead
   of the time Inngest received the event (by at most a day), and the submitter signed it.
   An EOA signature is checked locally; any other is asked of the chain, so smart-contract
   wallets verify too. A refused submission ends the run.
2. **read**: the Target KA's state. Minted ends the run with its UAL; stored goes to the
   mint; a draft (sealed, not shared) goes to the store, which only shares it. A KA already
   stored or minted keeps its first submitter.
3. **parse-paper**: fetches the PDF through the gateway, has GROBID parse its header and
   reads the start of its text (`openingChars`, 6,000 characters) with the rating's reader,
   in one step, so the PDF's bytes are never a step output. A file that is not a PDF, is over
   15 MB, that GROBID cannot parse (204, a 4xx other than 401, 403, 408 and 429, or an
   answer that is not well-formed TEI), that has no readable title, that the rating's reader
   cannot parse (`unreadable`) or that has no text layer (`no-text`) ends the run, refused,
   so every published paper can be rated. GROBID's 401 and 403 fail the run; 408 and 429 are
   retried. A DOI is kept only if it looks like one.
4. **check-field**: asks `gemini-3.5-flash-lite` (`fieldModel`, free tier) whether the paper
   is in VeriSci's field, from its title, abstract and opening (`checkField`, with core's
   `fieldCheckPrompt`; [ADR 0037](../../docs/adr/0037-verisci-rates-life-science-and-health-papers.md)).
   A paper `outside` ends the run `refused: outside-field` before anything is stored, and the
   run logs Gemini's reason with the CID. A failed check waits 30 s (`fieldRetryWait`,
   `check-field-wait-<n>`) and asks once more (`check-field-<n>-again`); when that fails too,
   the paper is published, its rating checking the field again, and the run logs
   `field-unchecked` with the failure and its HTTP status. The verdict is asked once per run:
   a later attempt reads the paper again but asks nothing, and a draft or a minted asset is
   never checked. Gemini gets 60 s (`fieldTimeoutMs`). The check reads untrusted text: a paper
   written to fool it is published, and its rating still checks the field.
5. **store**, then **mint**: `startMint` listens 10 s, then the run polls the state every
   30 s with `step.sleep`. A mint not seen after 10 minutes is started again
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)).

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)):

- **verify:** a chain that does not answer (for a smart-wallet signature) waits 2 minutes
  and runs verify again, up to 5 times, then fails the run.
- **read, parse-paper, store, mint:** a quorum failure, a node, gateway or GROBID that
  does not answer, or a draft gone before the store (`no-content`) waits 2 minutes and
  starts a new attempt from the read, which reads the paper again only when nothing is
  stored ([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)); a mint not seen
  after 10 minutes starts a new attempt at once. Up to 5 attempts.
- The run has 45 minutes in all, which can end it before its 5 attempts.
- It fails at once when its settings are missing or invalid, when the node or GROBID refuses
  our credential, or when the node does not serve the graph. A run that fails is recovered
  by publishing the same PDF again.

## Rating a paper

`verisci/rating.requested` carries `{ contract, requestId }`: a RatingController's lowercase
address and a phase-1 request id. The `rate-paper` run is a singleton per request id in mode
`skip` ([ADR 0020](../../docs/adr/0020-stuck-requests-recovered-only-oracle-cancels.md)),
has 180 minutes, enough for every attempt and the oracle, and outside `APP_ENV=local` is
throttled to 3 starts an hour with a burst of 3, against Inngest's free plan
([ADR 0015](../../docs/adr/0015-rating-requests-are-free-on-testnet.md)). It does only what
is left ([ADR 0007](../../docs/adr/0007-all-writes-converge.md)):

1. **Which requests:** the contract must be one of the environment's, current or past
   ([ADR 0023](../../docs/adr/0023-a-fix-is-a-redeploy-owner-powers-fixed.md)), or locally
   `LOCAL_RATING_CONTRACT`. **read-request** reads the request and the contract's oracle; a
   request no longer pending, or a contract whose oracle is not this deployment's key, ends
   the run before anything is spent.
2. **The target:** only papers verisci published are rated
   ([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md)). A UAL that does not
   parse, is not canonical
   ([ADR 0031](../../docs/adr/0031-uals-are-normalized-before-the-contract.md)), names another
   chain than Base Sepolia, or names another publisher is cancelled `invalid-target` at once.
   Then **find-target** asks the node whether the target is one of its published papers
   (`publishedPaperQuery`), and cancels `invalid-target` when the node answers that it is not
   (a wrong number, or an R-KA), whatever the request's age. The node answers a query on a
   graph it does not hold with no rows (`docs/domain.md` → DKG), so an empty answer counts
   only after **check-graph** confirms the node serves the graph; otherwise the run fails `setup` and cancels nothing. A
   node that does not answer is asked again every 2 minutes, up to 5 times, then the run
   fails `node-unreachable`.
3. **read-rka:** the R-KA `verisci-rka-<request id>`. Minted goes to the read-back. Stored is
   minted at once, with no wait for a mint an earlier run may have started
   ([ADR 0008](../../docs/adr/0008-mints-are-async-polled-in-short-steps.md)). A draft is
   shared, then minted. Missing is scored, then **store** writes the R-KA
   (`packages/core` → Ratings):
   - **find-pdf** reads the `ipfs://` link to the paper's PDF from its own asset graph. A
     link that is not an `ipfs://` CID cancels `invalid-target`. No link is retried:
     **find-target** found the paper in this graph, so the node is still loading it.
   - **read-paper** fetches the PDF through the gateway and extracts its text with unpdf
     (`packages/core` → Ratings → The paper's text), up to 150,000 characters. A PDF with no
     text layer (a scan), or one over the size limit (published before the limit was
     lowered from 30 to 15 MB), cancels `invalid-target`
     ([ADR 0011](../../docs/adr/0011-a-rating-is-a-separate-r-ka.md)). A file that is not a
     PDF or does not parse is read again on the next attempt, since the gateway may have given
     another file; after 3 such reads it cancels `invalid-target`.
   - **score-paper** asks Gemini, in one request, for the paper's field and study type and the
     answer to each of that type's checks, with quotes; `scoreChecks` checks the quotes and
     computes the score. A paper outside the life sciences and health cancels
     `invalid-target`
     ([ADR 0037](../../docs/adr/0037-verisci-rates-life-science-and-health-papers.md)).

   Each of these is done once per run: a later attempt starts from the first one missing.
4. **mint**, then **poll** every 30 s; a mint not seen after 10 minutes is started again.
5. **read-score** reads the score back from the minted R-KA, and the oracle function fulfils
   with it, so the score on chain equals the R-KA's
   ([ADR 0018](../../docs/adr/0018-phase-1-scorer-output-contract.md)).

Past the maximum age (24 hours after the request's block), a minted R-KA is still fulfilled;
a stored one is polled for 10 minutes without a new mint, and is fulfilled if it lands;
anything else is cancelled `expired`. A stored R-KA left behind, or one minted for a request
cancelled meanwhile, is an orphan: the outcome names it, and the run logs it as an error.

Retries ([ADR 0009](../../docs/adr/0009-retries-are-spaced-with-step-sleep.md)): a chain
that does not answer is read again every 2 minutes, up to 5 times. A node that does not
answer or gives no rows yet, a quorum failure, a gateway that does not give the PDF, a file
that does not read as a PDF (fewer than 3 times), or a Gemini call that is unreachable or
rate-limited waits 2 minutes and starts a new attempt from the R-KA's read, up to 5 attempts,
then fails (`node-unreachable`, `paper-unreachable`, `paper-unreadable`, `scorer-unavailable`;
`mint-not-confirmed` when the mint is never seen). A Gemini answer the check refuses is asked
for again once, then the run fails `scorer-unusable`: the same paper and prompt tend to give
the same answer, and each answer uses one of the free tier's 20 requests a day. A node that does not answer is never
taken for a missing paper. It fails at once (`setup`) on missing or invalid settings, a node that
refuses our key, Gemini refusing the request (the detail names its status), or a node that
does not serve the graph, and
(`rating-unreadable`) on a minted R-KA whose score does not parse. A failed run leaves the
request pending; the reconciler of the next plan restarts it.

The scorer makes one request to `gemini-3.8-flash` per paper, since the free tier allows 20
a day (`docs/domain.md` → Gemini): `scorePaper` sends `scorerPrompt`, temperature 0 and
`SCORER_OUTPUT_SCHEMA`, checks the answer with `parseScorerAnswer` (`askScorer`), then scores
a paper in the field with `scoreChecks`. A 429 is `rate-limited`; any other 4xx is
`refused`; a 5xx, a network error or no answer within 240 s is `unreachable`; each failure
Gemini answered carries its HTTP status (a bad key is 400, a key without access 401 or 403, a
model Gemini no longer serves 404). No candidate, a blocked or unfinished answer, or text
the check refuses (`parseScorerAnswer`: a check of the study type left unanswered, say) is
`invalid-output`; a quote, reason or rationale over its limit is cut, not refused. No failure
carries the key.

### Measuring the scorer

`scripts/reference-papers.json` holds 14 open-access papers: 12 in the life sciences and
health, covering every study type, some well reported and some poorly, and 2 outside the
field. For each in-field paper it records the answer a careful reader gives to each check,
and a score range 10 points either side of the score those answers give; a test keeps it
consistent with the checklists. The expectations were written before the scorer first read
the papers, and change only on purpose.

`pnpm --filter @verisci/workflows score-papers [id…]` scores them as a rating run would:
the PDF's text, then one request to Gemini, asked again as a rating run would. It prints,
for each paper, the study type found, the score against its range and, when the type is the
expected one, each check answered otherwise than expected, with why an answer lost its point:
its quote is not in the paper, it has none, or it says a check that always applies does not.
Run it whenever a prompt, a checklist or the model changes, and keep the change only if the
results improve. It needs `GEMINI_API_KEY` and `APP_ENV=local`, downloads each PDF once into
`node_modules/.cache/verisci-reference/` (a file that is not a PDF, such as a publisher's
robot check, is not kept: save the PDF there by hand), and writes the run's answers there
after each paper. It never publishes, stores or rates anything.

`score-papers --field [id…]` runs only the publish run's field check instead: it reads each
cached PDF as the publish run does (GROBID's header and the start of the text, so it also
needs `GROBID_URL`), asks `checkField`, and prints the expected and the found field with
Gemini's reason. Each paper costs one Flash-Lite request, which has its own daily limit.

Each paper costs one Gemini request, and the free tier allows 20 a day per Google project
(`docs/domain.md` → Gemini): a full run uses 14 of them. To try a change within a day, run
only the papers it should fix (`score-papers <id> <id>`), then the whole set once more before
keeping it. Google's terms forbid getting around the limit, so more keys or projects are not
an option; a paid tier is.

## The oracle function

`oracle-transaction` sends every fulfil and cancel the backend sends
([ADR 0019](../../docs/adr/0019-oracle-transactions-are-serialized.md)). Rating runs invoke it
with `step.invoke`; no event starts it. It runs one step at a time (concurrency 1) and has 30
minutes.

- **send:** reads the account's latest and pending nonces. A pending nonce above the latest
  is a transaction in flight: it sends nothing and checks again every 15 s. Otherwise it reads
  the request and the contract's oracle and decides: a request already settled sends nothing
  (fulfilled with the same R-KA, or cancelled, is an answer; fulfilled with another R-KA fails
  `oracle-conflict`). Then it sends at the latest nonce, with the chain's fee estimate capped
  at 10 gwei.
- **receipt:** every 5 s, in steps of its own, reading the receipt of every transaction sent
  for the call at once. A successful receipt settles it. A reverted one,
  or a nonce another transaction took, reads the request again. Unmined after 60 s, the same
  call goes out at the same nonce with both fees raised by 15%; a raise past the cap is not
  sent, and is logged once as `oracle-at-fee-cap`.
- A send refused as nonce too low, already known or underpriced counts as a transaction in
  flight. One that holds the nonce for 10 minutes is replaced by a zero-value transfer to the
  oracle's own address, priced one raise above the cap. An oracle that cannot pay its gas is
  logged as `oracle-no-funds`.
- Nothing settled within 25 minutes fails `oracle-stuck`. Inngest's concurrency counts
  executing steps, not sleeping runs, so the pending-nonce check, not the limit, keeps one
  transaction in flight at a time.

Its answer is `fulfilled` (with the score and R-KA the chain holds), `cancelled` (with the
chain's reason), `not-our-oracle`, or `unknown` (the contract no longer knows the request).
Errors logged with a fixed tag (`oracle-at-fee-cap`, `oracle-conflict`, `oracle-no-funds`,
`rating-orphan`) wait for alerts, which come with the next plan.

## The pages' calls

`getUploadService()` serves `apps/web`'s pages: the upload page
([ADR 0010](../../docs/adr/0010-pdf-to-target-ka-pipeline.md)), the paper's page and the
papers list:

- **`createUploadUrl()`** signs a Pinata upload URL, valid 5 minutes, for one file of at most
  15 MB detected as `application/pdf`, pinned with `cid_version` `v1` like `publish-pdf`, so
  one PDF keeps one CID (`docs/domain.md` → IPFS).
- **`submitPaper(input, limiter)`** checks a signed `{ cid, contextGraph, deadline,
  submitter, signature }` as the run does. A PDF whose Target KA is already minted starts
  nothing and counts nothing: the result gives its UAL instead of an event id. Otherwise it
  checks the submitter's limit (`rate-limited`), then the file pinned under that CID on
  Pinata's public network (`not-pinned` when there is none). A file over 15 MB or not a PDF
  is refused (`too-large`, `not-a-pdf`). A file that is not a PDF is also unpinned when its
  Target KA is known missing; a PDF stays pinned, since every environment shares Pinata's
  one file per CID and their size limits may differ
  ([ADR 0005](../../docs/adr/0005-staging-and-production-are-isolated.md)). It then sends
  `verisci/paper.submitted` with no time of its own, so Inngest stamps it, under the id
  `paper:<cid>:<submitter>:<deadline>`: Inngest drops a repeat of one signed submission for
  24 hours. A new signature starts a run unless one for that CID is active (the singleton),
  and the paper's page then follows the paper on the node. It returns Inngest's event id.
  Only a sent submission is counted. A chain, Pinata, limit store or Inngest that does not
  answer gives `unavailable`; a node that does not answer leaves the already-minted check to
  the run.
- **`readPaper(cid, eventId?)`** reads the Target KA's state on the node and, given the
  event id, the run Inngest started for it (REST, from the dev server locally). Once the KA
  is minted, it also reads the record back from the asset's own graph (SPARQL through the
  node: title, authors, DOI, PDF link, submitter, signature, deadline), checks the signature
  against the submitter as the run does, without the deadline rule (`unknown` when the
  chain does not answer within 3 s), and gives the agent address the asset is minted to
  (`publisher`: the UAL's author, our node). A failed run's status carries `failure`, the
  reason its error names; a minted paper whose record cannot be shown carries
  `recordProblem`: `unavailable` when the node did not answer the query, asked to retry, or
  answered 429 or a server error; `unreadable` when it refused the query, no record parses,
  or the asset's UAL names another agent than our node
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). Locally, a run's
  output comes from the dev server's GraphQL API, since its REST read answers it empty.
- **`listPapers({ page, pageSize })`** reads one page of this graph's published papers,
  newest mint first, from the node, with no database
  ([ADR 0035](../../docs/adr/0035-limits-are-the-apps-only-state.md)): only Target KAs our
  node minted, each read from its own asset's graph (`packages/core` → Target KAs). It asks
  for the page, with each paper's author count, and the total at once, then for the page's
  first three authors, then checks each signature as `readPaper` does; a check that waits on
  the chain for more than 3 s shows as `unknown`, so a slow RPC never holds the page. It returns
  `{ ok: true, total, papers }`, each paper's `PaperSummary` with its CID, UAL, mint date,
  title, first authors, author count, submitter and signature check; a page past the last
  has no papers. A node that does not answer, asks to retry, or answers 429 or a server error
  gives `unavailable`; a refused query, a count that does not parse, or a page the total
  covers that comes back with no readable row gives `unreadable`
  ([ADR 0021](../../docs/adr/0021-server-reads-return-typed-results.md)). A page or page size
  that is not a positive integer, a page size over 50, or a page whose offset is not a safe
  integer throws a `RangeError`.

## Running a publish locally

1. Start the RPC proxy, the DKG node and GROBID ([`docs/node-host.md`](../../docs/node-host.md)).
2. Fill the DKG and publish sections of the root `.env.local` ([`.env.example`](../../.env.example)).
3. `pnpm dev`, then, in another terminal, `pnpm --filter @verisci/web inngest` (the
   Inngest dev server, at http://localhost:8288).
4. `pnpm --filter @verisci/workflows publish-pdf <file.pdf>` pins the PDF on Pinata's public
   network with CIDv1 import settings, signs it with a throwaway key and sends the event. A
   relative path is read from the directory you type the command in.
   The run's steps and result show in the dev server.
5. Or publish through the page: open http://localhost:3000/publish with `REOWN_PROJECT_ID`
   set ([`apps/web`](../../apps/web/README.md#environment)).

## Running a rating locally

The rating functions run only against a contract whose oracle key you hold: locally, a
RatingController on Anvil ([ADR 0036](../../docs/adr/0036-local-rating-runs-use-anvil.md)).
R-KAs still go to the staging graph.

1. Start the RPC proxy and the DKG node ([`docs/node-host.md`](../../docs/node-host.md)), and
   `anvil --port 8546` in a terminal of its own: the proxy holds 8545, Anvil's default.
2. Deploy the contract on Anvil
   ([`packages/contracts` → Deploying on Anvil](../contracts/README.md#deploying-on-anvil)).
3. In the root `.env.local`, set `ORACLE_PRIVATE_KEY` to the key of Anvil's second account,
   `GEMINI_API_KEY`, `LOCAL_CHAIN_RPC_URL=http://127.0.0.1:8546` and `LOCAL_RATING_CONTRACT`
   ([`.env.example`](../../.env.example)), with the DKG and publish settings.
4. `pnpm dev`, then, in another terminal, `pnpm --filter @verisci/web inngest`.
5. `pnpm --filter @verisci/workflows rate-paper <target UAL>` requests a rating of a paper
   from the staging graph, from a throwaway requester it funds on Anvil, and sends the event.
   It prints the request id; the run shows in the dev server. `--raw` sends the UAL as typed,
   to see an invalid one cancelled.
6. `cast call <contract> "getRatingRequest(bytes32)" <request id> --rpc-url http://127.0.0.1:8546`
   shows the request, its score and its R-KA once fulfilled.

Restarting Anvil empties it: deploy again (the first deploy on a fresh chain gets the same
address). Every request comes from a new requester, so request ids never repeat.

The script stands in for the Alchemy webhook, which comes with the next plan: it reads the
`Phase1Requested` log from its own transaction's receipt and builds the event with
`ratingRequestedEvent`, the function the webhook route will call. From the event on, the run
is the one staging runs: the contract and its oracle, the target read from the staging graph,
Gemini's score, the R-KA minted on Base Sepolia, and the oracle's transaction and receipt.
Alchemy's signed delivery, Inngest crons in a branch environment and Base's handling of a
stuck transaction are checked on `develop`; the unit tests cover every branch with mocks.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @verisci/workflows typecheck` | Typechecks the package and its scripts |
| `pnpm --filter @verisci/workflows test` | Runs its Vitest project (`vitest run`) with mocked adapters |
| `pnpm --filter @verisci/workflows publish-pdf <file.pdf>` | Dev only: pins a PDF, signs it and sends `verisci/paper.submitted` to the local dev server |
| `pnpm --filter @verisci/workflows rate-paper <target UAL> [--raw]` | Dev only, `APP_ENV=local`: requests a rating on the Anvil contract from a throwaway requester and sends `verisci/rating.requested` to the local dev server |
| `pnpm --filter @verisci/workflows score-papers [--field] [id…]` | Dev only, `APP_ENV=local`: scores the reference papers with Gemini and compares each with what is expected, or with `--field` runs only the publish run's field check on them (Measuring the scorer above) |

Ships TypeScript source (`src/index.ts`, `src/env.ts`), with no build step. The source is
grouped by feature: `src/publish/`, `src/rating/`, `src/pdf/`, `src/gemini/` and `src/site/`
(`CLAUDE.md` here).
