# Backups & Free-Tier Guards Runbook (`INF-6`)

This runbook covers encrypted production PostgreSQL backups, restore procedures across `local` / `testing` / `production`, Supabase keep-alive, Cloudinary credit monitoring, and Worker bundle/asset budget checks.

Workflow: [`.github/workflows/web-guards.yml`](../../../../.github/workflows/web-guards.yml)
Guard scripts: [`apps/web/scripts/guards/`](../../../../apps/web/scripts/guards/)

## Overview

| Job / Guard | Schedule / Trigger | Target | Purpose |
|---|---|---|---|
| `backup-production` | Daily `03:41 UTC` + `workflow_dispatch` | `production` (`DATABASE_POOLER_URL`) | `pg_dump --format=custom` of `public` (and `derived` if present) piped through `age` encryption, uploaded as artifact `production-db-backup` (14-day retention). Also keeps production Supabase active. |
| `keepalive-testing` | Daily `05:23 UTC` + `workflow_dispatch` | `testing` (`DATABASE_POOLER_URL`) | Runs `select 1` via the IPv4 session pooler to prevent the 7-day Free-plan pause. |
| `cloudinary-usage` | Daily `06:11 UTC` + `workflow_dispatch` | Cloudinary Admin API | Checks `credits.usage / credits.limit` (warn >= 75%, fail >= 90%), writes summary to `$GITHUB_STEP_SUMMARY`. |
| `worker-budget.mjs` | CI step in `web-ci.yml` and `web-deploy.yml` (also runnable locally) | `wrangler` dry-run + `dist/client` | Checks uncompressed `.js`/`.mjs`/`.wasm` <= 60 MiB (limit 64 MiB) and static assets <= 18,000 (limit 20,000). Assets are counted as regular files only (directories and symlinks are skipped), as wrangler and Cloudflare do. |

## 0. Scheduled workflows are disabled after 60 days of inactivity

GitHub automatically disables `schedule:` workflows in a repository with no activity (commits, pushes, issues, PRs) for 60 days. Then the backup and the testing keep-alive silently stop, and Supabase Free pauses idle projects after 7 days. Mitigation (free, no extra service):

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

2. Verify `DATABASE_POOLER_URL` (IPv4 session pooler, port `5432`) is set in both `testing` and `production` environments (see [`supabase.md`](./supabase.md)).

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

### Restore into `testing` (over IPv4 session pooler)

Load the pooler URL from repo-root `.env` (`SUPABASE_TESTING_POOLER_URL`, port `5432`) and confirm the host is `growgen-testing` (`ckpozotzgubrjbjstvjg`, never transaction pooler `:6543`):

```bash
set -a; . ./.env; set +a
psql "$SUPABASE_TESTING_POOLER_URL" -v ON_ERROR_STOP=1 -tAc "select current_database(), inet_server_addr()"
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$SUPABASE_TESTING_POOLER_URL" \
  /tmp/growgen-restore/restore.dump
```

### Restore into `production` (emergency recovery only)

Only restore into `production` with explicit owner approval after verifying the dump against `local` or `testing` first:

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
# Runs keepalive-testing, backup-production, and cloudinary-usage:
gh workflow run web-guards.yml
gh run list --workflow=web-guards.yml --limit 5
gh run view <run-id> --log
```

Confirm in the run summary:
- `keepalive-testing` prints `1` from `select 1`.
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
