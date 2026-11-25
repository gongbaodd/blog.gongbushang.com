# Content sync between environments (INF-5)

`pnpm content:pull <source> [--to <target>] [options]` copies EmDash content (data only, `public` schema) between `local`, `testing` and `production` Postgres databases through the IPv4 session pooler. Default target is `local`. Also available as `pnpm --filter web content:pull`.

Never copied (D4, D11): users, passkeys, sessions, OAuth and API tokens, `options` (setup state, domain, encrypted plugin settings), plugin storage, audit log, migration ledger, runtime locks and queues, media usage index, redirect generation artifacts. Visitor comments and reactions (PII) are skipped unless `--include-comments`. The `derived` cache schema is skipped unless `--include-derived`.

## Required variables (names only, repo-root `.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_TESTING_POOLER_URL`, `SUPABASE_PRODUCTION_POOLER_URL` | session pooler URL (`postgres.<ref>@*.pooler.supabase.com:5432`) |
| `SUPABASE_TESTING_REF`, `SUPABASE_PRODUCTION_REF` | expected project ref per env |
| `SUPABASE_LOCAL_DB_URL` (optional) | defaults to `127.0.0.1:54322`; must be loopback |

## Safety gates

- Targets are identified by the project ref parsed from the URL username, not by the label. A URL whose ref differs from the labelled env's `*_REF` is refused.
- Both refs must be configured whenever a remote env is involved. A URL without a `postgres.<ref>` username is refused.
- Any target whose ref equals production's needs `--yes-production`, whatever it was labelled.
- `local` must be loopback; a remote host labelled local is a hard error. Self-sync (same ref) is refused.
- Every run asks you to type the target env name unless `--yes` (non-interactive runs without `--yes` are refused).
- Passwords are passed via `PGPASSWORD`, never argv. The temp working directory is always removed, including on failure.

## Usage

```bash
pnpm content:pull testing --dry-run            # plan only, no DB touched
pnpm content:pull testing                      # testing -> local
pnpm content:pull production --to testing      # production -> testing
```

`--dump-file <path>` keeps the raw dump on disk. It is PLAINTEXT content (plus comments with `--include-comments`); delete it afterwards.

## Known caveats

- `ec_*.author_id` (and similar owner columns) reference `users`, which is never synced, so the ids dangle in the target. FKs are not enforced during restore (replica role) and bylines come from `_emdash_bylines`.
- A schema-drift test (`apps/web/scripts/sync/sync.test.ts`) fails when a local `public` table is neither excluded nor a known content table; decide for each new EmDash table and update `lib.mjs`.
- Restore needs `psql`/`pg_dump` (libpq, major version >= the source server) or `--tool supabase` (Docker).
- Restoring into testing/production needs a role allowed to set `session_replication_role`; untested against cloud, run `--dry-run` first and only with Lead's go-ahead.
