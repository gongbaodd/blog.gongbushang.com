# Supabase runbook

| Env | Project | Ref | Region | Pooler host (session, :5432) |
|---|---|---|---|---|
| local | `supabase start` | n/a | n/a | `127.0.0.1:54322` |
| testing | growgen-testing | `ckpozotzgubrjbjstvjg` | ap-southeast-1 | `aws-0-ap-southeast-1.pooler.supabase.com` |
| production | growgen-production | `epewqznhtgjirbfeqfrj` | ap-southeast-1 | `aws-1-ap-southeast-1.pooler.supabase.com` |

Org `giwrismyariookakffxk`. The paused project `map` (eu-west-1) must stay paused: the Free plan allows 2 active projects.

Note the hosts differ (`aws-0` vs `aws-1`) per project. Never guess; get the host from the CLI.

## Get the session-pooler URL
```
supabase link --project-ref <ref>      # writes supabase/.temp/pooler-url (no user in it)
```
URL = `postgresql://postgres.<ref>:<URL-encoded password>@<host>:5432/postgres`. Use the session pooler (port 5432), never the transaction pooler (6543). The direct host `db.<ref>.supabase.co` is IPv6-only on Free, so CI, the CLI and backups must use the pooler.

Local secrets in repo-root `.env` (gitignored): `SUPABASE_{TESTING,PRODUCTION}_DB_PASSWORD`, `_REF`, `_POOLER_URL`. GitHub environment secret `DATABASE_POOLER_URL` exists in the `testing` and `production` environments.

## Connect
Use node `pg` with `ssl: { rejectUnauthorized: false }` (no psql installed) and run `select version()`. Both projects: PostgreSQL 17.12.

## Migrate
```
set -a; . ./.env; set +a; cd apps/web
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_TESTING_POOLER_URL"
pnpm exec emdash migrate --from-config --status        # prints "Target fingerprint"
pnpm exec emdash migrate --from-config --expected-target-fingerprint <fingerprint>
```
The apply is non-interactive only with `--expected-target-fingerprint`. Check that the printed host matches the intended project first. It takes about 2 minutes against the cloud. Testing was migrated on 2026-11-24 (98 migrations, 73 public tables, all owned by `postgres`, which EmDash requires). Production is migrated by CI in INF-4.

## TODO (INF-6)
- Keep-alive: Free projects pause after 7 days of inactivity.
- Backups: Free has no automatic downloadable backups; schedule `pg_dump` via the session pooler from CI.
