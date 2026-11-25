# INF-6 report: free-tier guards and backups

Workflow `.github/workflows/web-guards.yml`, scripts `apps/web/scripts/guards/`, runbook `runbooks/backups.md`.

## Review fixes

- `scripts/guards/*.test.ts` is in the `apps/web` vitest include (present via feat/emdash; verified running, 9 tests).
- `worker-budget.mjs` now replaces the duplicated inline shell in `web-ci.yml` and `web-deploy.yml` (same thresholds: 60 MiB worker, 18,000 assets). Assets are counted as regular files only, as wrangler and the Cloudflare 20,000 limit do (directories reported as info).
- Runbook: GitHub disables scheduled workflows after 60 days of repo inactivity; added the explanation, a monthly `gh workflow list`/`gh run list` check and re-enable command.
- Runbook: pre-restore safety dump now covers `public` + `derived` (nightly scope) with pg_dump 17; `pg_restore` 17+ requirement documented.
- Quoted `$VERSION_CODENAME` (SC2086) in `web-guards.yml`; actionlint clean on the three workflows.
