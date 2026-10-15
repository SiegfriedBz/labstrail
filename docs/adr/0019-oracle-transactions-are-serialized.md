# 0019. Oracle transactions are serialized

- Status: Accepted
- Date: 2026-10-02

## Context

Every `fulfil` and `cancel` is sent from one oracle account. In the previous repo concurrent runs each fetched the next nonce and raced: one won, the others failed or replaced each other. The oracle key is a hot key held by Vercel, and its balance pays every rating.

## Decision

- Every oracle transaction the backend sends goes through one dedicated Inngest function that runs one step at a time. A step reads the request, decides ([0007](0007-all-writes-converge.md)) and sends; later steps check the receipt, waiting between checks with `step.sleep`, so no step waits on the chain ([0008](0008-mints-are-async-polled-in-short-steps.md)). A transaction still pending holds back the next send. Workflows call the function with `step.invoke` instead of signing themselves.
- A transaction stuck unmined is replaced at the same nonce with higher fees, up to a fee cap; at the cap, the function alerts, since every rating waits on this lane.
- In an emergency, the owner points the oracle role at another key ([0020](0020-stuck-requests-recovered-only-oracle-cancels.md)); a person holding that key cancels by hand, outside the function.
- Only the `main` and `develop` deployments hold the production and staging oracle keys, and only they serve the rating, reconciler and oracle functions with those keys. Production refuses to start without its key ([0004](0004-env-variables-per-workspace-one-root-file.md)).
- A rating run stops before spending anything unless the contract's oracle is its own key. A developer can therefore run the rating functions locally only with their own key, against their own contract.
- Each key holds only a few days of gas and alerts below a threshold. It is rotated through the contract's `setOracleAgent`, owner only; the owner key is never held by Vercel or CI.

## Consequences

- No nonce races, and a stuck transaction cannot block the queue for good. Inngest's concurrency limit counts executing steps, not sleeping runs ([domain](../domain.md)), so the one-at-a-time lane rests on the pending-nonce check.
- One oracle transaction per confirmation time: ample for testnet.
- Previews never sign as the oracle.
- The rating plan builds the function and sets its timeouts, fee cap and alert threshold.

## History

- 2026-10-10: corrected: "the agents plan" is now "the rating plan", since the agents package was renamed `workflows`.
- 2026-10-11: the rule covers the transactions the backend sends; in an emergency, a person holding the key the owner pointed the oracle role at cancels by hand, outside the function, so the emergency path in [0020](0020-stuck-requests-recovered-only-oracle-cancels.md) no longer contradicts this ADR (rating run plan, user's choice).
- 2026-10-11: the receipt is checked in later steps, with `step.sleep` between them, and a pending transaction holds back the next send (was: one step reads, sends and waits for the receipt), so every step stays well inside the function time limit ([0008](0008-mints-are-async-polled-in-short-steps.md)) (rating run plan, user's choice).
