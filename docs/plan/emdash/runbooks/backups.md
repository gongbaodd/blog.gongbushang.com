# Backups & Free-Tier Guards Runbook (`INF-6`)

This runbook covers encrypted production PostgreSQL backups, restore procedures across `local` / `production` (INF-10 retired `testing`), Supabase keep-alive, Cloudinary credit monitoring, and Worker bundle/asset budget checks.

Workflow: [`.github/workflows/web-guards.yml`](../../../../.github/workflows/web-guards.yml)
Guard scripts: [`apps/web/scripts/guards/`](../../../../apps/web/scripts/guards/)

## Overview

| Job / Guard | Schedule / Trigger | Target | Purpose |
|---|---|---|---|
| `backup-production` | Daily `03:41 UTC` + `workflow_dispatch` | `production` (`DATABASE_POOLER_URL`) | `pg_dump --format=custom` of `public` (and `derived` if present) piped through `age` encryption, uploaded as artifact `production-db-backup` (14-day retention). Also keeps production Supabase active: this nightly connection is the keep-alive (the separate `keepalive-testing` job was removed by INF-10). It only counts if the job gets as far as connecting, so a missing `BACKUP_AGE_RECIPIENT` or `DATABASE_POOLER_URL` secret (the job fails before it connects) also stops the keep-alive. Check the first run after any secret change. |
| `cloudinary-usage` | Daily `06:11 UTC` + `workflow_dispatch` | Cloudinary Admin API | Checks `credits.usage / credits.limit` (warn >= 75%, fail >= 90%), writes summary to `$GITHUB_STEP_SUMMARY`. |
| `worker-budget.mjs` | CI step in `web-ci.yml` and `web-deploy.yml` (also runnable locally) | `wrangler` dry-run + `dist/client` | Checks uncompressed `.js`/`.mjs`/`.wasm` <= 60 MiB (limit 64 MiB) and static assets <= 18,000 (limit 20,000). Assets are counted as regular files only (directories and symlinks are skipped), as wrangler and Cloudflare do. |

## 0. Scheduled workflows are disabled after 60 days of inactivity

GitHub automatically disables `schedule:` workflows in a repository with no activity (commits, pushes, issues, PRs) for 60 days. Then the backup (and with it the keep-alive) silently stops, and Supabase Free pauses idle projects after 7 days. Mitigation (free, no extra service):

- Any push to the repo counts as activity, and this blog normally receives pushes well inside 60 days. GitHub also emails the repo owner before it disables a workflow; do not filter those emails.
- Monthly check (calendar reminder), which also proves the backup is fresh:

  ```bash
  gh workflow list --all | grep web-guards          # must say "active", not "disabled_inactivity"
  gh run list --workflow=web-guards.yml --limit 5   # latest scheduled run must be < 2 days old
  gh workflow enable web-guards.yml                 # re-enable if it was disabled
  ```

- If a long quiet period is expected, push a trivial commit before the 60 days elapse.

## 1. One-Time `age` Keypair & GitHub Secrets Setup

Because this repository is public, backups are encrypted with an `age` **public recipient key** (`age1...`) before upload. The private identity key (`AGE-SECRET-KEY-1...`) stays **offline** in a password manager and is never stored in GitHub or the repo.

### Generate the offline keypair

Run on a trusted local machine (never on CI):

```bash
age-keygen -o ~/growgen-backup.agekey
chmod 600 ~/growgen-backup.agekey
```

`age-keygen` prints the public key line (`# public key: age1...`). Move `~/growgen-backup.agekey` into your password manager / offline backup and delete any stray copies.

### Configure GitHub secrets

1. Set the public recipient on the **`production`** GitHub environment (so `backup-production` can encrypt dumps):

   ```bash
   gh secret set BACKUP_AGE_RECIPIENT --env production --body "age1..."
   ```

2. Verify `DATABASE_POOLER_URL` (IPv4 session pooler, port `5432`) is set in the `production` environment and points at project `ckpozotzgubrjbjstvjg` (`aws-0-ap-southeast-1`) (see [`supabase.md`](./supabase.md)).

3. Set the Cloudinary Admin API credentials as **repository secrets** (used by `cloudinary-usage`):
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

   Optional repository variables: `CLOUDINARY_WARN_PCT` (default `75`), `CLOUDINARY_FAIL_PCT` (default `90`).

## 2. What `backup-production` Backs Up

`backup-production` connects over the IPv4 session pooler (`DATABASE_POOLER_URL`) using PostgreSQL 17 `pg_dump`:

- Always includes `--schema=public` (all EmDash CMS tables, posts, terms, media, settings).
- Checks `information_schema.schemata` via `psql` first and includes `--schema=derived` when `derived` exists on production (cached embeddings, UMAP coordinates, cover colors, geocodes, post hints from `PORT-8`). Before `derived` is migrated onto production, it logs a notice and backs up `public` cleanly without failing.
- Uses `--format=custom --no-owner --no-privileges` and `set -euo pipefail`, then fails if the encrypted artifact is `<= 1024` bytes.
- Fails closed unless `BACKUP_AGE_RECIPIENT` matches `^age1[0-9a-z]{58}$` (SEC-10).
- Connects as the read-only `growgen_backup` role through `BACKUP_DATABASE_URL` when that secret exists; otherwise it falls back to the owner `DATABASE_POOLER_URL` and logs a `::warning::` (SEC-11, see below). Either way the URL is split into `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` (with `PGSSLMODE=require`) through a 0600 temp file, so the password never appears in a process's argv (SEC-14).
- Installs `pg_dump` 17 from PGDG only after the downloaded signing key matches both the pinned SHA-256 (`PGDG_KEY_SHA256`) and the OpenPGP fingerprint `B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8` (SEC-10). If PGDG re-publishes the key file (e.g. an expiry extension), the hash check fails: confirm the fingerprint is unchanged (`gpg --show-keys --with-colons ACCC4CF8.asc`), then update `PGDG_KEY_SHA256` in `web-guards.yml`.

### Excluded table data (SEC-10)

The repo is public, so any GitHub account can download the encrypted artifact for 14 days ("harvest now, decrypt later" if the age key ever leaks). The dump keeps every table's **schema** but skips the **data** of volatile token/log tables:

| Table | Why dropping it on restore is fine |
|---|---|
| `auth_tokens`, `auth_challenges` | sessions, magic links, WebAuthn challenges: users sign in again |
| `_emdash_authorization_codes`, `_emdash_device_codes`, `_emdash_oauth_tokens` | short-lived OAuth codes and access/refresh tokens: clients re-authorize |
| `_emdash_rate_limits`, `_emdash_404_log` | runtime counters and logs |

Still included: `users`, `credentials` (passkey public keys, needed to sign in after a restore), `_emdash_api_tokens`, `_plugin_storage`, `audit_logs` and all content. Keep this list in sync with the `excludes` loop in `web-guards.yml`.

### Least-privilege backup role (SEC-11, owner-only)

`backup-production` only needs to read. Once, by the owner (never by agents or CI):

1. Create the role (idempotent, no password inside): `psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/roles/growgen_backup.sql`. The last row must read `t | t | f | f | t | f` (login, bypassrls, not superuser, no CREATE on the database, TEMP from the default PUBLIC grant, no CREATE on `public`). The role is `LOGIN NOINHERIT BYPASSRLS`, `default_transaction_read_only = on`, with `CONNECT` plus `USAGE`/`SELECT` on `public` and `derived` and default privileges for future `postgres`-owned tables. BYPASSRLS is required because SEC-01 enables RLS on every `public.*` table and `pg_dump` refuses to dump through RLS. Tested on local Supabase (GON-198): applies twice cleanly as the non-superuser `postgres`, dumps all 83 tables' data through RLS, and both `DELETE` (read-only transaction) and, after `SET default_transaction_read_only = off`, writes and DDL (no privilege) are refused.
2. Set its password client-side (hashed by psql, never in argv or logs): `psql "$SUPABASE_PRODUCTION_POOLER_URL" -c '\password growgen_backup'`, with a fresh random value (`openssl rand -hex 32`).
3. Store the URL as the `production` environment secret `BACKUP_DATABASE_URL`: `postgresql://growgen_backup.<project-ref>:<password>@<pooler-host>:5432/postgres` (Supavisor user format `role.ref`, session pooler port 5432). `gh secret set BACKUP_DATABASE_URL --env production`, then paste at the prompt.
4. `gh workflow run web-guards.yml`, and check that the log no longer shows the "dumping as the owner role" warning and the artifact has a normal size. Then run a restore drill (section 5).
5. If the job ever logs `permission denied for table ...` (a new table not owned by `postgres`), re-run step 1.

## 3. Downloading, Decrypting, and Restoring a Backup

### Download the artifact

List recent `web-guards` runs and download the encrypted `.dump.age` artifact from a `backup-production` run:

```bash
gh run list --workflow=web-guards.yml --limit 10
gh run download <run-id> -n production-db-backup -D /tmp/growgen-restore
ls -lh /tmp/growgen-restore
```

### Decrypt with the offline private key

```bash
age -d -i ~/growgen-backup.agekey \
  /tmp/growgen-restore/growgen-production-<timestamp>.dump.age \
  > /tmp/growgen-restore/restore.dump
```

Inspect the archive table of contents before restoring anything:

```bash
pg_restore --list /tmp/growgen-restore/restore.dump | head -n 40
```

> **Tool versions:** the dumps are written by PostgreSQL 17 `pg_dump` (custom format). `pg_restore` must also be version 17 or newer, otherwise it refuses the archive ("unsupported version in file header"). On macOS: `brew install libpq` (or `postgresql@17`) and put its `bin` first on `PATH`; verify with `pg_restore --version`. The local Supabase container also ships 17 (`docker exec supabase_db_<project> pg_restore --version`).

### Restore into `local` (Supabase local stack)

```bash
supabase start
# Local DB runs at postgresql://postgres:postgres@127.0.0.1:54322/postgres
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  /tmp/growgen-restore/restore.dump
```

> **Note on `derived` schema / `pgvector`:** If the dump includes `derived`, ensure the target database has `create extension if not exists vector with schema extensions;` applied first (run `pnpm --filter web derive:migrate` against the target pooler URL before `pg_restore`, or apply `supabase/migrations/20261125000000_derived_schema.sql`).

### Restore into `production` (emergency recovery only)

Only restore into `production` with explicit owner approval after verifying the dump against `local` first (there is no second remote environment to rehearse on):

```bash
set -a; . ./.env; set +a
# Take a pre-restore safety snapshot first if production is reachable. Match the nightly scope
# exactly: public plus derived (drop the derived line only if that schema does not exist yet).
# Use pg_dump 17, same as the nightly job.
pg_dump "$SUPABASE_PRODUCTION_POOLER_URL" --format=custom --schema=public --schema=derived --no-owner --no-privileges \
  -f "/tmp/growgen-restore/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$SUPABASE_PRODUCTION_POOLER_URL" \
  /tmp/growgen-restore/restore.dump
```

Clean up `/tmp/growgen-restore` when finished so decrypted dumps do not linger on disk.

## 4. Verifying `web-guards` and Guard Scripts

### Trigger and verify GitHub Actions jobs

```bash
# Runs backup-production and cloudinary-usage:
gh workflow run web-guards.yml
gh run list --workflow=web-guards.yml --limit 5
gh run view <run-id> --log
```

Confirm in the run summary:
- `backup-production` logs `Dumping schemas: --schema=public --schema=derived` (once `derived` exists) and uploads `production-db-backup`.
- `cloudinary-usage` posts the **Cloudinary Usage Guard** table to `$GITHUB_STEP_SUMMARY` with credits used, percentage, storage, and bandwidth.

### Run guard scripts locally

```bash
# Cloudinary usage (reads CLOUDINARY_* from .env)
set -a; . ./.env; set +a
node apps/web/scripts/guards/cloudinary-usage.mjs --warn-pct 75 --fail-pct 90 --json

# Worker bundle + static asset budget (after wrangler dry-run)
node apps/web/scripts/guards/worker-budget.mjs \
  --worker-dir /tmp/wrangler-dry \
  --assets-dir apps/web/dist/client \
  --max-mib 60 \
  --max-assets 18000

# Guard unit tests
pnpm --filter web exec vitest run scripts/guards/guards.test.ts
```

## 5. Restore drill (SEC-10, owner-only)

A backup is only proven once it has been restored. Run a drill after the first `backup-production` run with the SEC-10/11 settings, after any change to the backup job or role, and then quarterly. Restore into `local` only:

```bash
mkdir -p /tmp/growgen-restore && chmod 700 /tmp/growgen-restore
gh run download <run-id> -n production-db-backup -D /tmp/growgen-restore
age -d -i ~/growgen-backup.agekey -o /tmp/growgen-restore/restore.dump /tmp/growgen-restore/growgen-production-*.dump.age
chmod 600 /tmp/growgen-restore/restore.dump
pg_restore --version                                     # must be >= 17
pg_restore --list /tmp/growgen-restore/restore.dump | wc -l
pnpm db:start
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://postgres:postgres@127.0.0.1:54322/postgres" /tmp/growgen-restore/restore.dump
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -tAc \
  "select (select count(*) from public.ec_posts) as posts, (select count(*) from public.media) as media, (select count(*) from public.auth_tokens) as auth_tokens"
# then start the Docker admin against local (admin-docker.md), open a few posts and sign in with a passkey
rm -rf /tmp/growgen-restore
```

Expected: `auth_tokens` and the other excluded tables are empty; post and media counts match production; the admin opens and a passkey sign-in works (credentials are kept).

### Drill log (owner fills in)

| Date (UTC) | Run ID | Backup timestamp | Restored into | `pg_restore --list` entries | Posts / media | Admin + passkey OK? | Duration | Issues | By |
|---|---|---|---|---|---|---|---|---|---|
| _YYYY-MM-DD_ | | | `local` | | | | | | |
