# INF-10 report: collapse environments to local + production (GON-202)

Branch `emdash/INF-10` (from `feat/emdash` c4306909). Code, config, tests and docs only. Nothing was deployed; no secrets, Supabase projects, GitHub environments, DNS, `.env` values or remote DBs were touched.

## What changed
- `apps/web/wrangler.jsonc`: `env.testing` and `env.admin-testing` removed. Top level carries the promoted Hyperdrive `319cee5e...` and KV `SESSION` `55d3e3f7...`, `workers_dev: false`, `preview_urls: false`, `routes: next.growgen.xyz` (custom domain, config only), `vars.PUBLIC_SITE_LIVE: "false"`. `wrangler-lockdown.test.ts` and `TEMPLATE_DIFF.md` updated.
- Live flag `PUBLIC_SITE_LIVE` (`src/lib/site-live.ts`, `isSiteLive`): used by `astro.config.mjs`, `scripts/post-build.mjs`, `robots.txt.ts`, `analytics/env.ts` (`isLiveBuild`), AdSense, `middleware.ts`, `lockdown.ts`, `scripts/e2e.mjs`.
- `rebuild-on-publish/dispatch.ts`: `production` only.
- `scripts/admin/*`, `scripts/sync/*` (`ENVS` is local + production), root `package.json` (`admin:testing`, `deploy:testing:*` removed; `deploy:production:build` and `deploy:production:dry-run` added), `check-build-env.mjs` rewritten (no `env.production` block exists, so it now refuses a `.dev.vars` that sets the Hyperdrive variable).
- `apps/admin`: `safety.mjs`, `smoke.mjs`, tests, `rebuild-on-publish.ts`, `.env.example`, `docker-compose.yml`.
- Workflows: `web-ci.yml` (verify only, no deploy), `web-deploy.yml` (production only), `web-guards.yml` (keep-alive job and cron removed).
- Docs: `AGENT_RULES.md` rule 7, plan index (INF-10), runbooks `ci`, `supabase`, `backups`, `content-sync`, `admin`, `admin-docker`, `deploy-production`, `data`; `deploy-testing.md` deleted. `knowledge.md` is history and left alone.

## Lead gaps
1. **PR CI writing to production.** Chose the derive read-only mode (`DERIVE_READONLY=1`) over an ephemeral Postgres: an empty local DB cannot run URL parity or the size guard, and seeding 995 posts into a CI Supabase is heavy and slow, while read-only keeps the real-data guards. It has three layers: the derive session is `default_transaction_read_only = on`; every cache write (`saveHints`, `upsert*`, `prune*`, `saveUmapState`) is a no-op (unit-tested in `scripts/derive/readonly.test.ts`); `DERIVE_EMBED=skip`, `DERIVE_SKIP_COLORS=1`, and the Workers AI and geocoding credentials are removed from the environment. `web-ci.yml` sets it at job level, has no deploy step and no `CLOUDFLARE_API_TOKEN`, and `DATABASE_POOLER_URL` is exposed only to `migrate --check` and `Build`. Fork PRs are skipped. `migrate --check` is unchanged (read-only).
   - Verified locally: the full web build succeeded with a SELECT-only role that has `default_transaction_read_only=on` (so neither derive nor EmDash's prerender wrote anything). The temporary role was dropped afterwards.
   - Residual: a same-repo PR can still edit the workflow. Real enforcement is a SELECT-only Postgres role (SEC-11) for the CI secret.
   - Caveat: with a cold or model-mismatched embedding cache, per-post `/api/cards/*` pages (posts with UMAP coordinates) are missing and parity fails. This is the same behaviour as before for token-less CI. It showed up locally because my local cache has stale content hashes, so `src/lib/route-parity.test.ts` fails when run against that dist; it is skipped without a dist. Check the first PR run against the real production cache.
2. **apps/admin.** `evaluateStartup`: `SITE_ENV=testing` is refused with a clear message; any remote DB must match `SUPABASE_PRODUCTION_REF` (also under `ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL`); production keeps confirm + Access; `sslmode` strip, `outer.ts` runtime gate and fail-closed on missing refs are untouched. Admin tests 34/34, build and smoke pass.
3. **Live flag.** Only the exact string `true` is live (tests: unset, `false`, `TRUE`, typos, `true` in site-live, analytics, middleware, lockdown). One switch: the GitHub `production` variable feeds the build and, via `wrangler deploy --var` in `web-deploy.yml`, the Worker var. `SITE_ENV` only drives dispatch and admin gates. The default for unset is no longer `testing`: nothing reads `SITE_ENV` for indexing any more, so unset means not live. Built dist verified: disallow-all robots, noindex `_headers`, no analytics.
4. **content:pull**: `local` and `production` only, `SUPABASE_PRODUCTION_REF` check and `--yes-production` intact; `testing` is unknown and refused (tested).
5. **workers_dev/preview_urls + route**: route added as config. Per Lead, `next.growgen.xyz` is currently served by `growgen-web-testing`; the switch-over order and rollback are in `runbooks/deploy-production.md` and in the owner checklist below. Owner must confirm the zone and domain move.
6. **Keep-alive.** Removing it is safe: `backup-production` connects to the single project nightly (03:41 UTC) and the Worker cron `*/5` also runs once deployed. Caveat: the backup fails before connecting if `BACKUP_AGE_RECIPIENT` or `DATABASE_POOLER_URL` is missing, which would also stop the keep-alive; check its first run. Nightly `web-deploy` is not relied upon.
7. **Conflict risk.** `emdash/SEC-hardening-198` was not touched. Expect conflicts in `wrangler.jsonc` (`workers_dev`, which I also set) and `apps/admin` (`safety.mjs`, tests); take either side for `workers_dev: false`.
8. **Other references.** Grepped `apps/web/scripts`, `apps/admin`, workflows, `package.json`, runbooks, rules. The `data.md` MIG-3 section now says production and requires owner confirmation and a check of whether MIG-3 is already applied on `ckpozotzgubrjbjstvjg`. The derived migration SQL comment mentioning testing is left alone (migrations are immutable).

## Checks
- `pnpm --filter web exec vitest run`: 34 files pass; 2 route-parity tests fail only against my locally built, read-only dist (stale local embedding cache, see above). With no dist they are skipped, as in CI before the build.
- Web build (read-only, SELECT-only role) ok. `wrangler deploy --dry-run -c dist/server/wrangler.json`: worker 19.64 MiB uncompressed (limit 64), 4090 static assets (limit 20,000); bindings show the promoted Hyperdrive and KV, `PUBLIC_SITE_LIVE "false"`; routes, `workers_dev:false` in the built config.
- `astro check`: apps/web 0 errors; root 0 errors; `pnpm test:unit` 221 passed; admin typecheck, build, tests, smoke ok.
- `E2E_CHROME_CHANNEL=chrome pnpm --filter web test:e2e`: 14 scenarios pass.
- `actionlint` clean.
- Not measured: CPU on a deployed Worker (nothing deployed).

## Owner checklist to append to GON-199
1. `.env`: set `SUPABASE_PRODUCTION_REF=ckpozotzgubrjbjstvjg`, `SUPABASE_PRODUCTION_POOLER_URL` (aws-0 host), `SUPABASE_PRODUCTION_DB_PASSWORD`, `EMDASH_PRODUCTION_ENCRYPTION_KEY` (the existing testing key value, not rotated); delete all `*_TESTING_*` entries.
2. GitHub `production` environment: set secret `DATABASE_POOLER_URL` to the `ckpozotzgubrjbjstvjg` session pooler URL; ensure `BACKUP_AGE_RECIPIENT` exists; leave variable `PUBLIC_SITE_LIVE` unset or `false`. Optionally add a SELECT-only DB role for it (SEC-11).
3. Check whether MIG-3 (derived podcast/gallery tables, 150 episodes, 75 images) exists on `ckpozotzgubrjbjstvjg`; if not, apply it per `data.md` (writes to production; owner go-ahead).
4. Confirm `growgen.xyz` DNS/zone and the custom-domain move, then in order: (a) set `growgen-web` secrets `EMDASH_ENCRYPTION_KEY`, `EMDASH_SITE_URL=https://next.growgen.xyz`, optional `GITHUB_DISPATCH_TOKEN`; (b) detach `next.growgen.xyz` from `growgen-web-testing`; (c) deploy `growgen-web` right away (short outage between b and c); (d) verify 200, `x-robots-tag: noindex`, robots `Disallow: /`, `/_emdash/admin` 404, no analytics/ads, `wrangler tail` CPU; (e) only then delete `growgen-web-testing`. Rollback: re-attach the domain to `growgen-web-testing`.
5. Delete the GitHub `testing` environment and the Supabase project `epewqznhtgjirbfeqfrj`; optionally rename `ckpozotzgubrjbjstvjg` to `growgen-production` in the Dashboard.
6. After merge, watch the first PR CI run (parity with the real cache) and the first nightly backup (keep-alive).
7. At CUT-1 only: set `PUBLIC_SITE_LIVE=true` and re-run `web-deploy`.
