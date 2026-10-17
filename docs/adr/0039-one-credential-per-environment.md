# 0039. Each environment reaches the node server with its own credential

- Status: Accepted
- Date: 2026-10-17

## Context

The DKG daemon has a single admin token, valid for every graph on the node ([domain](../domain.md) → DKG). Once the node is on its host ([0006](0006-dkg-node-runs-on-a-dedicated-host.md)), staging, production and developers' computers all call it, and GROBID beside it, over the internet. Handing each of them the admin token would mean one leak forces a change everywhere, and the token would sit in every deployment's settings.

## Decision

- Caddy, the host's only public entry, checks one bearer credential per environment: `local` (developers' computers), `staging` (`develop` and feature previews, which use staging's graph, [0005](0005-staging-and-production-are-isolated.md)) and `production`.
- The same credential opens the daemon's API and GROBID. The app sends it to both as `DKG_TOKEN`.
- Caddy forwards to the daemon with the admin token, which never leaves the host. GROBID gets no credential from Caddy.
- `/api/status`, the health check, answers without a credential. Everything else without a valid credential is refused.
- Revoking or rotating one environment's credential leaves the others working.

## Consequences

- The admin token stays on the host: not in Vercel, not on a developer's computer.
- Every credential still reaches both graphs, since the daemon has no token per graph: the `-prod` guard stays ([0005](0005-staging-and-production-are-isolated.md)).
- Rotating the admin token means updating Caddy's settings on the host as well.
- The credentials live on the host, in each environment's settings and in the maintainer's password manager, never in the repo.
