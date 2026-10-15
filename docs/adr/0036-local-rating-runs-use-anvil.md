# 0036. Local rating runs use an Anvil chain

- Status: Accepted
- Date: 2026-10-11

## Context

A rating run stops unless the contract's oracle is its own key, and only `develop` holds staging's ([0019](0019-oracle-transactions-are-serialized.md)). A developer testing the rating functions on their computer needs a contract whose oracle key they hold. The deployments file lists only staging's and production's contracts ([0028](0028-deployed-addresses-are-committed.md)).

## Decision

- A developer runs the rating functions against a RatingController on a local Anvil chain, deployed with the local configuration the deploy script already has, whose oracle is one of Anvil's default accounts.
- When `APP_ENV=local`, the workflows and the web app read that contract's address and Anvil's URL from two local-only settings. The local pages read and request ratings on that contract only, and the wallet offers Anvil ([0034](0034-users-connect-a-wallet-anyone-may-publish.md)). Staging's and production's addresses stay in the committed file.
- No webhook watches Anvil, so locally the page that sent a request announces it: once the transaction's receipt holds the request's log, the server reads that log from Anvil itself and sends the event the webhook would send ([0017](0017-chain-events-are-ingested-at-least-once.md)). Deployed, the server refuses to announce.
- Local runs score with the same scorer and write their R-KAs to the staging graph, as other local work does ([0005](0005-staging-and-production-are-isolated.md)).

## Consequences

- No testnet funds and no faucet: Anvil's accounts are funded, and it mines each transaction at once.
- Fee raises and Base's receipts are not exercised locally; `develop` is where they are first seen.
- R-KAs from local runs sit in the staging graph, recorded by no contract the staging UI reads ([0014](0014-contract-owns-scores-dkg-owns-content.md)). Locally, the pages show only ratings made on Anvil: a paper rated on staging reads as unrated.
- A local announce that never happens (the tab closed before the receipt) leaves the request pending; the developer asks for a new rating.

## History

- 2026-10-12: request ids no longer repeat after an Anvil restart, since the contract hashes its deployment time into each id ([0016](0016-asset-names-derive-from-request-id.md)); requests no longer need a fresh account.
- 2026-10-15: the web app reads and requests ratings on the Anvil contract too, and locally the page announces its own request, since no webhook watches Anvil (rating UI, user's choice).
