# infra/node-server

The DKG node server's configuration files: the Caddy site and the systemd units that run
the DKG daemon beside the RPC proxy ([`../rpc-proxy/`](../rpc-proxy/README.md)) and GROBID.
They are copied to the server by hand; [`docs/node-host.md`](../../docs/node-host.md) says
when and how. Not a workspace: no `package.json`, no code.

## Files

| File | On the server | What it does |
| --- | --- | --- |
| [`Caddyfile`](Caddyfile) | `/etc/caddy/Caddyfile` | Serves `verisci-dkg.duckdns.org` (the daemon's API) and `verisci-grobid.duckdns.org` (GROBID) over HTTPS; opens both to each environment's credential, `/api/status` to anyone, and forwards to the daemon with its admin token ([ADR 0039](../../docs/adr/0039-one-credential-per-environment.md)) |
| [`caddy-env.conf`](caddy-env.conf) | `/etc/systemd/system/caddy.service.d/verisci.conf` | Gives Caddy the secrets in `/etc/caddy/verisci.env` |
| [`dkg.service`](dkg.service) | `/etc/systemd/system/dkg.service` | Runs `dkg start -f` as `ubuntu`, after the RPC proxy, restarting it on failure |

## Caddy's secrets

`/etc/caddy/verisci.env` lives only on the server, owned by root, mode 600. Its values are
never committed; the credentials are also kept in the maintainer's password manager.

| Variable | Value |
| --- | --- |
| `VERISCI_LOCAL_TOKEN` | Developers' computers' credential (`DKG_TOKEN` in `.env.local`) |
| `VERISCI_STAGING_TOKEN` | `develop`'s and feature previews' credential (Vercel's Preview scope) |
| `VERISCI_PRODUCTION_TOKEN` | Production's credential (Vercel's Production scope) |
| `DKG_ADMIN_TOKEN` | The daemon's admin token, the second line of `~/.dkg/auth.token` |

Each credential is 64 hex characters (`openssl rand -hex 32`). An empty credential opens
nothing. Revoking one means replacing it with a new value, then
`sudo systemctl reload caddy`; the other environments keep working.
