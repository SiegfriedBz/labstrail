# 0017. Chain events are ingested at least once

- Status: Accepted
- Date: 2026-10-02

## Context

Rating requests reach verisci as Alchemy Notify webhook calls carrying contract logs. Webhooks are delivered at least once, so a log can arrive twice, and after a chain reorganization Alchemy Notify delivers the new block, so a log delivered earlier may no longer be on chain. The previous route checked the signature but neither deduplicated logs nor handled removed ones.

## Decision

- The webhook route verifies the HMAC signature over the raw body, in constant time, before parsing it; a mismatch is a 401.
- Only the contract's request log becomes an Inngest event, with an id derived from the request id, so a duplicate delivery collapses into the existing event.
- The route answers 200 only once Inngest has accepted the events; otherwise 5xx, so Alchemy Notify delivers again.
- Logs marked `removed` are ignored, and every run re-reads the request on chain before acting.
- Delivery is not trusted for completeness: a request whose webhook never arrives is found by the reconciler ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)).
- Locally, where no webhook watches Anvil, the page that sent a request announces it through the server, which reads the request's log from the chain itself and sends the same event, with the same id ([0036](0036-local-rating-runs-use-anvil.md)). Deployed, the page never announces a request: the webhook does, and the reconciler finds what it misses ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)).

## Consequences

- A duplicate or replayed webhook never starts a second rating; past Inngest's 24-hour dedup window, the request's single run and convergent writes stop a repeat ([0007](0007-all-writes-converge.md)).
- A request reorged out is never acted on from its stale log.
- A lost webhook delays a rating; it never loses it.

## History

- 2026-10-15: locally, the page announces its own request, since no webhook watches Anvil ([0036](0036-local-rating-runs-use-anvil.md)) (rating UI, user's choice).
- 2026-10-15: corrected: deployed, the reconciler starts ratings too, as [0020](0020-stuck-requests-recovered-only-oracle-cancels.md) decides; the page never announces there (rating UI review).
- 2026-10-16: corrected: names the Alchemy Notify webhook, not plain Alchemy, whose RPC VeriSci also uses (intake and recovery).
- 2026-10-16: corrected: after a reorg, Alchemy Notify delivers the new block; its GraphQL logs carry no `removed` mark, so the run's read of the request on chain is what stops a dropped request (intake and recovery review, user's choice).
