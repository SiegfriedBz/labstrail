# infra/node-server

The DKG node server's configuration files: the Caddy site and the systemd units that run
the DKG daemon beside the RPC proxy ([`../rpc-proxy/`](../rpc-proxy/README.md)) and GROBID.
They are copied to the server by hand; [`docs/node-host.md`](../../docs/node-host.md) says
when and how. Configuration only, outside the pnpm workspaces.

## Files

| File | On the server | What it does |
| --- | --- | --- |
| [`Caddyfile`](Caddyfile) | `/etc/caddy/Caddyfile` | Serves `verisci-dkg.duckdns.org` (the daemon's API) and `verisci-grobid.duckdns.org` (GROBID) over HTTPS; opens both to each environment's credential and `/api/status` to anyone, forwards that health check with no token and every other daemon route with the admin token ([ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)) |
| [`caddy-env.conf`](caddy-env.conf) | `/etc/systemd/system/caddy.service.d/verisci.conf` | Gives Caddy the secrets in `/etc/caddy/verisci.env`; starts Caddy with its config alone, since Ubuntu's unit adds `--environ`, which writes every variable to the journal; stops a start or reload when one of the four secrets is empty |
| [`dkg.service`](dkg.service) | `/etc/systemd/system/dkg.service` | Runs `dkg start -f` as `ubuntu`, after the RPC proxy, and starts it again whenever it exits: `sudo systemctl stop dkg` stops it |

## Caddy's secrets

`/etc/caddy/verisci.env` lives on the server, owned by root, mode 600. Each credential's
only other copy is in its environment's settings
([ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)).

| Variable | Value |
| --- | --- |
| `VERISCI_LOCAL_TOKEN` | Developers' computers' credential (`DKG_TOKEN` in `.env.local`) |
| `VERISCI_STAGING_TOKEN` | `develop`'s and feature previews' credential (Vercel's Preview scope) |
| `VERISCI_PRODUCTION_TOKEN` | Production's credential (Vercel's Production scope) |
| `DKG_ADMIN_TOKEN` | The daemon's admin token, the second line of `~/.dkg/auth.token` |

Each credential is 64 hex characters (`openssl rand -hex 32`). Caddy refuses to start or
reload with any of the four empty. Revoking a credential means replacing it with a new
value, then `sudo systemctl reload caddy`; the other environments keep working.
