# CI runbook (INF-4, INF-6, INF-8)

Three workflows under `.github/workflows/`. Legacy `e2e.yml` and `sync-content.yml` are untouched. The new ones use a `paths` filter (web-ci) or are event-driven, so legacy-only changes (`src/`, other `packages/*`) do not trigger them. Build happens in GitHub Actions, never in Workers Builds.

| Workflow | Triggers | Environment | What it does |
|---|---|---|---|
| `web-ci.yml` | PR to `feat/emdash` or `master` touching `apps/web/**`, `supabase/**`, lockfile, `packages/shiki-plantuml`, `web-*.yml`; manual | `ci-readonly` (`DATABASE_POOLER_URL` only) | vitest, `astro check`, read-only `emdash migrate --from-config --check`, build with `DERIVE_READONLY=1`, empty-build guard, URL parity, size guard (`wrangler deploy --dry-run`). **No deploy step.** Fork PRs are skipped (no secrets). |
| `web-deploy.yml` | `repository_dispatch` `emdash-publish`, nightly 02:17 UTC, manual (`apply_migrations`) | `production` (only target; a dispatch or input naming anything else, such as a stale `testing`, fails the `target` job) | optional migration apply, full (writing) build, guards, deploy |
| `web-guards.yml` | daily 03:41 UTC (production backup), daily 06:11 UTC (Cloudinary usage), manual | `production` (backup) | `pg_dump -Fc --schema=public` of production piped through `age`, uploaded as artifact `production-db-backup`, retention 14 days. The nightly connection also keeps the single Free Supabase project from pausing (there is no separate keep-alive job since INF-10). |

## PR builds read the production database but never write to it (INF-10)
There is no throwaway `testing` database any more, so `web-ci` builds against production. `pnpm --filter web build` runs `derive`, which normally writes the `derived.*` cache (hints, embeddings, colours, geocodes, traces, UMAP state) and may spend Workers AI quota. PR builds therefore run with `DERIVE_READONLY=1` (job-level env in `web-ci.yml`), which:
1. opens the derive Postgres session with `default_transaction_read_only = on`, so any stray write fails loudly;
2. turns every cache write (`saveHints`, `upsert*`, `prune*`, `saveUmapState`) into a no-op;
3. forces cache hits only (`DERIVE_EMBED=skip`, `DERIVE_SKIP_COLORS=1`) and removes the Workers AI and geocoding credentials from the process environment.
In read-only mode a cached vector for the same legacy id is accepted even when the post was edited since (stale hash), so edited posts keep their UMAP point and `/api/cards`/`/api/relates` pages. Posts with no cached vector at all (brand-new posts, or a cold cache) cannot be placed: derive lists them in `apps/web/.derive/readonly-missing.txt` and warns, and the parity step passes it as `--allow-missing`, so only those posts' card and relates pages may be missing. Cover colours, traces and geocodes simply stay absent in a PR. `emdash migrate --check` is read-only by design. `DATABASE_POOLER_URL` is exposed only to the `migrate --check` and `Build` steps, and fork PRs are skipped, so they never see it.
Residual risk: EmDash's own prerender connection is not forced into a read-only session (startup options through the Supabase pooler are not relied on; see the local check in reports/INF-10.md), and a same-repo PR can change the workflow itself. The proper hardening is a Postgres role with only `SELECT` (SEC-11) used for `DATABASE_POOLER_URL` in `web-ci`; until then this is mitigated, not enforced, for the EmDash side.

Guards in the build jobs:
- **Empty-build**: fails if the build log contains `runtime init failed`, or prerendered `index.html` count is below `WEB_MIN_PAGES` (default 3), or posts (`dist/client/YYYY/MM/DD/**/index.html`) below `WEB_MIN_POSTS` (default 0). Set repository variable `WEB_MIN_POSTS` to about 990 once MIG-1 has imported the posts.
- **Free-tier size**: `wrangler deploy --dry-run` output over 60 MiB uncompressed, or more than 18,000 files in `dist/client`, fails the job.

## Secrets and variables
Environment secrets (Settings, Environments). There is one environment, `production` (the former `testing` GitHub environment is deleted by the owner, GON-199):

| Name | `production` | Used by |
|---|---|---|
| `DATABASE_POOLER_URL` (also in `ci-readonly`; session pooler, IPv4, port 5432; project `ckpozotzgubrjbjstvjg`, host `aws-0-ap-southeast-1.pooler.supabase.com`) | must point at the promoted project | web-ci (migrate check, read-only build), web-deploy (migrate check/apply, build prerender), web-guards (backup) |
| `CLOUDFLARE_API_TOKEN` | exists | web-deploy (`wrangler deploy`) only; web-ci never uses it |
| `CF_AI_TOKEN` (Workers-AI-only scope, never the deploy token) + `CF_ACCOUNT_ID` | not yet wired (PORT-8b) | build step running `derive` (embeddings) in web-deploy only; see data.md |
| `BACKUP_AGE_RECIPIENT` (age public key `age1...`) | **missing, must be created** | web-guards backup |

Repository variables (optional): `WEB_MIN_POSTS`, `WEB_MIN_PAGES`.

Environment **variables** (Settings, Environments, Variables; public values, not secrets) on the `production` environment. `web-deploy` passes them to the build as `PUBLIC_*`.

| Variable | Meaning |
|---|---|
| `PUBLIC_SITE_LIVE` | **The one go-live switch (fail closed).** Leave unset (or `false`) until CUT-1: then `next.growgen.xyz` is noindex (`_headers` and `X-Robots-Tag`), serves a disallow-all `robots.txt`, and loads no analytics or ads, whatever the variables below hold. Only the exact value `true` makes the build indexable and lets the analytics/ads variables take effect; `web-deploy` also passes it to the Worker with `wrangler deploy --var`. `TRUE`, `1`, typos and unset all stay not live. `SITE_ENV` has nothing to do with it. |
| `PUBLIC_MIXPANEL_TOKEN` | Mixpanel project token (empty: analytics never loads) |
| `PUBLIC_MIXPANEL_API_HOST` | e.g. `https://api-eu.mixpanel.com` |
| `PUBLIC_ADSENSE_ENABLED` | `true` to render AdSense |
| `PUBLIC_ADSENSE_CONSENT_READY` | `true` once the consent flow gates ads |
| `PUBLIC_ADSENSE_SLOT_ID` | AdSense slot id |

`web-ci.yml` passes none of them (a PR build is never live).

## Which environment a CMS publish rebuilds
The `rebuild-on-publish` plugin sends `client_payload.environment` taken from `SITE_ENV` (`production` on the deployed Worker and on `admin:production`). If `SITE_ENV` is anything else (`local`, unset, the retired `testing`, a typo) the plugin sends nothing and logs that it skipped, so a local admin session never triggers a rebuild. `web-deploy`'s `target` job validates the value against the allowlist (production only, no fallback) and passes it on as a job output; the payload is never interpolated into a `run:` script. Scheduled posts published by the deployed cron have no dispatch token, so they appear after the nightly rebuild.
Not secret, hardcoded in the workflows: `CLOUDFLARE_ACCOUNT_ID`.
Separate from CI: the CMS publish hook (`GITHUB_DISPATCH_TOKEN`, a fine-grained token allowed to dispatch to this repo) is a Worker secret, not a GitHub secret.

## One-time setup still needed
1. `age-keygen -o ~/growgen-backup.agekey` on an offline machine; store the private key in a password manager; `gh secret set BACKUP_AGE_RECIPIENT --env production` with the `age1...` line (public).
2. Optionally add required reviewers to the `production` environment. Note this also blocks the nightly production rebuild and backup until approved; if you want those unattended, leave the environment without reviewers and rely on manual dispatch for risky changes.
3. The Cloudflare token needs Workers Scripts edit on the account (and, for the custom-domain route in `wrangler.jsonc`, Workers Routes / DNS edit on the `growgen.xyz` zone). The Hyperdrive and KV ids are baked into `wrangler.jsonc` (the promoted former testing resources).
4. Create the GitHub environment `ci-readonly` (no reviewers, no branch restriction) with one secret, `DATABASE_POOLER_URL`: ideally a session-pooler URL of a SELECT-only Postgres role (SEC-11; it needs `BYPASSRLS` or read policies, because RLS is on and without it derive sees an empty cache; until it exists, the production URL). It must not hold the Cloudflare token.
5. Set the repository/environment variable `PUBLIC_SITE_LIVE` only at CUT-1.

## Restore
```
age -d -i ~/growgen-backup.agekey growgen-production-<ts>.dump.age > restore.dump
pg_restore --no-owner -d "$TARGET_POOLER_URL" restore.dump
```

## Notes
- `emdash migrate --check` needs no fingerprint; applying non-interactively does. `web-deploy` with `apply_migrations` parses the fingerprint from `--status` output (unverified against a real pending migration; check the first run).
- `web-deploy` triggers on `repository_dispatch`, which runs on the default branch's workflow file (`master`), so it is inert until this merges to the default branch. Until then use manual dispatch from the branch.
- Nothing here has been run on GitHub yet; YAML validated with yaml-lint and actionlint 1.7.7.
