# 0036. Local rating runs use an Anvil chain

- Status: Accepted
- Date: 2026-10-11

## Context

A rating run stops unless the contract's oracle is its own key, and only `develop` holds staging's ([0019](0019-oracle-transactions-are-serialized.md)). A developer testing the rating functions on their computer needs a contract whose oracle key they hold. The deployments file lists only staging's and production's contracts ([0028](0028-deployed-addresses-are-committed.md)).

## Decision

- A developer runs the rating functions against a RatingController on a local Anvil chain, deployed with the local configuration the deploy script already has, whose oracle is one of Anvil's default accounts.
- When `APP_ENV=local`, the workflows read that contract's address and Anvil's URL from two local-only settings. Staging's and production's addresses stay in the committed file.
- Local runs score with the same scorer and write their R-KAs to the staging graph, as other local work does ([0005](0005-staging-and-production-are-isolated.md)).

## Consequences

- No testnet funds and no faucet: Anvil's accounts are funded, and it mines each transaction at once.
- Fee raises and Base's receipts are not exercised locally; `develop` is where they are first seen.
- R-KAs from local runs sit in the staging graph, recorded by no contract the staging UI reads ([0014](0014-contract-owns-scores-dkg-owns-content.md)).

## History

- 2026-10-12: request ids no longer repeat after an Anvil restart, since the contract hashes its deployment time into each id ([0016](0016-asset-names-derive-from-request-id.md)); requests no longer need a fresh account.
