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
- Without the bot's settings, as locally, messages are only logged.

## Consequences

- The maintainer hears of an outage within the hour, on a phone, at no cost.
- One chat mixes environments and levels; the prefix tells them apart. Activity grows with requests, bounded by the throttle ([0015](0015-rating-requests-are-free-on-testnet.md)).
- Telegram sees the messages: paper titles, addresses, request ids and error text, never a key.
- The DKG node's uptime is not watched until it has a public address ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)).
