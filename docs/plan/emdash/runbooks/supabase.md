# Supabase runbook

| Env | Project | Ref | Region | Pooler host (session, :5432) |
|---|---|---|---|---|
| local | `supabase start` | n/a | n/a | `127.0.0.1:54322` |
| production | growgen-testing, promoted by INF-10 (rename the display name to `growgen-production` in the Dashboard if wanted; the ref does not change) | `ckpozotzgubrjbjstvjg` | ap-southeast-1 | `aws-0-ap-southeast-1.pooler.supabase.com` |
| ~~old production~~ | growgen-production (`epewqznhtgjirbfeqfrj`, `aws-1-ap-southeast-1`), unused, **to be deleted by the owner (GON-199)** to free a Free slot | | | |

Org `giwrismyariookakffxk`. The paused project `map` (eu-west-1) must stay paused: the Free plan allows 2 active projects.

The two projects had different pooler hosts (`aws-0` vs `aws-1`). Never guess; get the host from the CLI.

## Get the session-pooler URL
```
supabase link --project-ref <ref>      # writes supabase/.temp/pooler-url (no user in it)
```
URL = `postgresql://postgres.<ref>:<URL-encoded password>@<host>:5432/postgres`. Use the session pooler (port 5432), never the transaction pooler (6543). The direct host `db.<ref>.supabase.co` is IPv6-only on Free, so CI, the CLI and backups must use the pooler.

Local secrets in repo-root `.env` (gitignored): `SUPABASE_PRODUCTION_DB_PASSWORD`, `SUPABASE_PRODUCTION_REF` (`ckpozotzgubrjbjstvjg`), `SUPABASE_PRODUCTION_POOLER_URL`; the old `SUPABASE_TESTING_*` entries are removed (GON-199). GitHub environment secret `DATABASE_POOLER_URL` lives in the `production` environment only.

## Connect
Verified TLS only (SEC-09). Repo scripts use `pgClientConfig(url)` from `apps/web/scripts/admin/pg-tls.mjs`: loopback hosts get no TLS, every other host is verified (`rejectUnauthorized: true`) against `apps/web/scripts/certs/prod-ca-2021.crt` ("Supabase Root 2021 CA", expires 2031-04-26, SHA-256 `80:70:25:AD:...:CA:FA`), or against `DATABASE_CA_CERT` (PEM text or a file path, the same variable and rules as `apps/admin`). `ssl*` URL parameters are stripped because node-postgres would let them replace the CA. The file is byte-identical to Supabase's published `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt` (Dashboard -> Database -> SSL Configuration -> Download certificate), and the production pooler's chain (`*.pooler.supabase.com` <- Supabase Intermediate 2021 CA <- this root) verifies against it with hostname checking (checked 2026-11-26, GON-198). For psql/libpq use `sslmode=verify-full sslrootcert=apps/web/scripts/certs/prod-ca-2021.crt`. Never use `rejectUnauthorized: false`. Run `select version()`: PostgreSQL 17.12.

## Migrate
```
set -a; . ./.env; set +a; cd apps/web
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_PRODUCTION_POOLER_URL"
pnpm exec emdash migrate --from-config --status        # prints "Target fingerprint"
pnpm exec emdash migrate --from-config --expected-target-fingerprint <fingerprint>
```
The apply is non-interactive only with `--expected-target-fingerprint`. Check that the printed host matches the intended project first. It takes about 2 minutes against the cloud. The project now called production (formerly testing) was migrated on 2026-11-24 (98 migrations, 73 public tables, all owned by `postgres`, which EmDash requires). Later migrations are applied by `web-deploy` with `apply_migrations`, or by hand as above. After any `emdash migrate` run, re-run the `SEC-01` RLS lockdown migration below so any newly created `public.*` tables have RLS enabled.

## Security: PostgREST Data API & RLS lockdown (`SEC-01`)

Neither `apps/web` nor `apps/admin` uses Supabase PostgREST (both connect directly to Postgres as the `postgres` owner role). Because Supabase enables the Data API on `public` by default and project refs are public, every environment must enforce two independent layers of protection:

### 1. Disable Data API on the cloud Dashboard (project `ckpozotzgubrjbjstvjg`)

Perform once on the one remote project (`ckpozotzgubrjbjstvjg`):

1. Open the Supabase Dashboard -> **Project Settings** -> **Data API**.
2. Toggle **Enable Data API** **off**.
3. If your plan/dashboard requires keeping Data API enabled, clear **Exposed schemas** (remove `public` and `graphql_public` so the list is empty) and clear **Extra search path** (`public`).
4. Verify no REST endpoints expose tables: `curl -i "https://<ref>.supabase.co/rest/v1/users"` should return `404` / `401` / `403` (never table data).

Local `supabase/config.toml` mirrors this posture (`[api] enabled = false`, `schemas = []`, `extra_search_path = []`, `auto_expose_new_tables = false`).

### 2. Apply / re-run `20261125020000_lockdown_public_rls.sql`

`supabase/migrations/20261125020000_lockdown_public_rls.sql` enables Row Level Security (with no permissive policies) on every table in `public` (and `derived`), revokes all schema/table/sequence/function privileges from `anon` and `authenticated`, and revokes `postgres` default privileges for those roles. Because `postgres` is the table owner and bypasses RLS, EmDash (`apps/admin`, `apps/web` build/cron) and `derive` continue working untouched.

The script is **fully idempotent** and is **not** run by `derive:migrate` (which only applies `*_derived_*.sql`). Run it once on each existing environment and **re-run it after every future `emdash migrate`** (since new EmDash migrations may create new `public.*` tables without RLS). Order after a migrate: `emdash migrate` → this lockdown → `supabase/roles/growgen_ci_readonly.sql` (it needs RLS enabled and grants per table).

What it does **not** cover (acceptable only because layer 1, the Data API, is off; GON-193 review):
- Default privileges whose grantor is `supabase_admin` (extensions and Supabase internals in `public`, `graphql_public`, `graphql`, `supabase_functions`). Only `supabase_admin` can change them. Tables created by `emdash migrate` are owned by `postgres` and are covered.
- `anon`'s USAGE on the `graphql_public` and `storage` schemas.
- A table created after the last run has RLS off until the script is re-run. No grant reaches `anon` for it, so it is still blocked, but the second layer is missing until then. Run the first verification query below after each migrate.

Functions: the script also revokes EXECUTE from `PUBLIC` on every function in `public` and `derived` (today all are trigger functions, which fire regardless).

Using Node `pg` (no `psql` needed; substitute `SUPABASE_PRODUCTION_POOLER_URL` for production, or `postgresql://postgres:postgres@127.0.0.1:54322/postgres` for local):
```sh
set -a; . ./.env; set +a; cd apps/web
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import pg from "pg";
  import { pgClientConfig } from "./scripts/admin/pg-tls.mjs";
  const url = process.env.SUPABASE_PRODUCTION_POOLER_URL;
  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  try {
    await client.query(readFileSync("../../supabase/migrations/20261125020000_lockdown_public_rls.sql", "utf8"));
  } finally {
    await client.end();
  }
'
```

Or with `psql` (when installed):
```sh
set -a; . ./.env; set +a
psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261125020000_lockdown_public_rls.sql
```

You can also run it once via `supabase db push` on a linked project, or paste the file into the Supabase Dashboard **SQL Editor** when re-applying after a future `emdash migrate`.

### 3. Verify lockdown state

Both queries below should return **0 rows** on `local` and `production`:
```sql
-- Tables in public/derived missing RLS
select schemaname, tablename
from pg_tables
where schemaname in ('public', 'derived')
  and not rowsecurity;

-- Remaining table privileges for Data API roles
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where grantee in ('anon', 'authenticated')
  and table_schema in ('public', 'derived');
```

## TODO (INF-6)
- Keep-alive: Free projects pause after 7 days of inactivity.
- Backups: Free has no automatic downloadable backups; schedule `pg_dump` via the session pooler from CI.
