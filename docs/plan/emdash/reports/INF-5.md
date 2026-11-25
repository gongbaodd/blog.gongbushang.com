# INF-5 report: content sync

Script: `apps/web/scripts/sync/{lib,pull}.mjs`, tests `sync.test.ts`, runbook `runbooks/content-sync.md`.

## Review fixes

- Production gate now keyed on Supabase project ref (parsed from pooler username) against `SUPABASE_TESTING_REF` / `SUPABASE_PRODUCTION_REF`; non-loopback `local` is a hard error; any target with production's ref needs `--yes-production`; self-sync by ref.
- Added `content:pull` (root and apps/web) and a runbook.
- `scripts/sync/*.test.ts` added to `apps/web/vitest.config.ts`; `apps/web` gets a `test` script.
- Plaintext cleanup: execute phase throws (no `process.exit` inside try) so `finally` always removes the temp dir; DB passwords go via `PGPASSWORD`; `--dump-file` is chmod 600 and the plan warns it is plaintext.
- Schema-drift test enumerates local `public` tables; excluded media usage index and redirect artifacts; comments excluded unless `--include-comments`; `author_id` dangling documented; type-the-env-name confirmation unless `--yes`.
