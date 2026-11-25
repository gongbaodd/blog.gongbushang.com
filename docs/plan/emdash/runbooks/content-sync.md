# Content sync between environments (INF-5)

`pnpm content:pull <source> [--to <target>] [options]` copies EmDash content (data only, `public` schema) between `local` and `production` Postgres databases (INF-10: the former `testing` project is production; `testing` is refused as unknown). The main use is pulling production into local through the IPv4 session pooler. Default target is `local`. Also available as `pnpm --filter web content:pull`.

Never copied (D4, D11): users, passkeys, sessions, OAuth and API tokens, `options` (setup state, domain, encrypted plugin settings), plugin storage, audit log, migration ledger, runtime locks and queues, media usage index, redirect generation artifacts. Visitor comments and reactions (PII) are skipped unless `--include-comments`. The `derived` cache schema is skipped unless `--include-derived`.

## Required variables (names only, repo-root `.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_PRODUCTION_POOLER_URL` | session pooler URL (`postgres.<ref>@*.pooler.supabase.com:5432`) |
| `SUPABASE_PRODUCTION_REF` | expected project ref (`ckpozotzgubrjbjstvjg`) |
| `SUPABASE_LOCAL_DB_URL` (optional) | defaults to `127.0.0.1:54322`; must be loopback |

## Safety gates

- Targets are identified by the project ref parsed from the URL username, not by the label. A URL whose ref differs from `SUPABASE_PRODUCTION_REF` is refused (a leftover URL of the deleted old production project is therefore refused too).
- `SUPABASE_PRODUCTION_REF` must be set whenever the remote env is involved, and the URL must match it. A URL without a `postgres.<ref>` username is refused.
- URL query parameters other than `?sslmode=` are refused: libpq lets `?user=`, `?host=`, `?hostaddr=`, `?port=`, `?dbname=`, `?service=`, `?options=`, `?password=` override what the checks inspected.
- Any target whose ref equals production's needs `--yes-production`, whatever it was labelled. Pulling production into local does not.
- `local` must be loopback; a remote host labelled local is a hard error. Self-sync (same ref) is refused.
- Every run asks you to type the target env name unless `--yes` (non-interactive runs without `--yes` are refused).
- Passwords are passed via `PGPASSWORD`, never argv. The temp working directory is always removed, including on failure.

## Usage

```bash
pnpm content:pull production --dry-run         # plan only, no DB touched
pnpm content:pull production                   # production -> local (the main use)
pnpm content:pull local --to production --yes-production   # local -> production: overwrites LIVE content, owner approval only
```

`--dump-file <path>` keeps the raw dump on disk. It is PLAINTEXT content (plus comments with `--include-comments`); delete it afterwards.

## Known caveats

- `ec_*.author_id` (and similar owner columns) reference `users`, which is never synced, so the ids dangle in the target. FKs are not enforced during restore (replica role) and bylines come from `_emdash_bylines`.
- A schema-drift test (`apps/web/scripts/sync/sync.test.ts`) fails when a local `public` table is neither excluded nor a known content table; decide for each new EmDash table and update `lib.mjs`.
- Restore needs `psql`/`pg_dump` (libpq, major version >= the source server) or `--tool supabase` (Docker).
- Restoring into production needs a role allowed to set `session_replication_role`; untested against cloud, run `--dry-run` first and only with Lead's go-ahead.
