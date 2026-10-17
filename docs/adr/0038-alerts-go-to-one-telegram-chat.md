# 0038. Alerts and activity go to one Telegram chat

- Status: Accepted
- Date: 2026-10-16

## Context

Ratings run unattended. A scorer outage, an oracle out of gas or stuck at its fee cap, a publisher wallet running dry, or a request the reconciler could not settle stopped work with only a log line, and [0015](0015-rating-requests-are-free-on-testnet.md), [0019](0019-oracle-transactions-are-serialized.md) and [0020](0020-stuck-requests-recovered-only-oracle-cancels.md) ask for alerts. The maintainer also wants to see each paper published and each rating settled. The MVP pays for nothing.

## Decision

- One way tells the maintainer everything: a single `notify()` posting to one Telegram chat, through a bot, for every environment. Each message names its environment and whether it is an alert or activity.
- Alerts: a run that failed for good, an oracle without funds or at its fee cap, an R-KA the contract will never record, and, from a check every hour, the oracle's or a publisher wallet's balance under its threshold and requests pending past the reconciler's reach.
- Activity: each paper a run published, and each rating the oracle settled, with a link to its page.
- Each message is sent once, from a step of its own; a send that fails is logged and never fails the run that sent it.
- The bot's settings are optional: a deployment without them, like a feature preview or a developer's computer, starts and only logs its messages ([0004](0004-env-variables-per-workspace-one-root-file.md)). Production and `develop` hold them.

## Consequences

- The maintainer hears, on a phone and at no cost, of a low balance or a request pending too long within the hour, and of a scorer outage when the first run gives up on it, about 2 hours in with the rating run's waits ([0009](0009-retries-are-spaced-with-step-sleep.md)).
- A deployment that misses the bot's settings still starts, and its alerts reach only its logs: setting them is part of deploying production and `develop`.
- One chat mixes environments and levels; the prefix tells them apart. Activity grows with requests, bounded by the throttle ([0015](0015-rating-requests-are-free-on-testnet.md)).
- Telegram sees the messages: paper titles, addresses, request ids and error text, never a key.
- The DKG node's uptime is not watched yet; its health check, `/api/status`, is open ([0039](0039-one-credential-per-environment.md)).

## History

- 2026-10-17: the node has its public address ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)); its uptime stays unwatched until the first deployment adds a check (node server, user's choice).
