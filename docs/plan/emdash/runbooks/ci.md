# CI runbook (INF-4, INF-6)

Three workflows under `.github/workflows/`. Legacy `e2e.yml` and `sync-content.yml` are untouched. The new ones use a `paths` filter (web-ci) or are event-driven, so legacy-only changes (`src/`, other `packages/*`) do not trigger them. Build happens in GitHub Actions, never in Workers Builds.

| Workflow | Triggers | Environment | What it does |
|---|---|---|---|
| `web-ci.yml` | PR to `feat/emdash` or `master` touching `apps/web/**`, `supabase/**`, lockfile, `packages/shiki-plantuml`, `web-*.yml`; manual | `testing` | vitest, `astro check`, `emdash migrate --from-config --check`, build (`CLOUDFLARE_ENV=testing SITE_ENV=testing`), empty-build guard, size guard, `wrangler deploy` to `growgen-web-testing`. Fork PRs are skipped (no secrets). |
| `web-deploy.yml` | `repository_dispatch` `emdash-publish`, nightly 02:17 UTC, manual (`environment` testing/production, `apply_migrations`) | testing for dispatch and manual default; **production** for the nightly schedule or manual choice | optional migration apply, build, guards, deploy |
| `web-guards.yml` | daily 03:41 UTC (production backup), daily 05:23 UTC (testing keep-alive), manual | `production` (backup), `testing` (keep-alive) | `select 1` via pooler; `pg_dump -Fc --schema=public` of production piped through `age`, uploaded as artifact `production-db-backup`, retention 14 days |

Guards in the build jobs:
- **Empty-build**: fails if the build log contains `runtime init failed`, or prerendered `index.html` count is below `WEB_MIN_PAGES` (default 3), or posts (`dist/client/YYYY/MM/DD/**/index.html`) below `WEB_MIN_POSTS` (default 0). Set repository variable `WEB_MIN_POSTS` to about 990 once MIG-1 has imported the posts.
- **Free-tier size**: `wrangler deploy --dry-run` output over 60 MiB uncompressed, or more than 18,000 files in `dist/client`, fails the job.

## Secrets and variables
Environment secrets (Settings, Environments):

| Name | `testing` | `production` | Used by |
|---|---|---|---|
| `DATABASE_POOLER_URL` (session pooler, IPv4, port 5432) | exists | exists | web-ci, web-deploy (migrate check/apply, build prerender), web-guards (keep-alive on testing, backup on production) |
| `CLOUDFLARE_API_TOKEN` | exists | exists | web-ci, web-deploy (`wrangler deploy`) |
| `BACKUP_AGE_RECIPIENT` (age public key `age1...`) | not needed | **missing, must be created** | web-guards backup |

Repository variables (optional): `WEB_MIN_POSTS`, `WEB_MIN_PAGES`.
Not secret, hardcoded in the workflows: `CLOUDFLARE_ACCOUNT_ID`.
Separate from CI: the CMS publish hook (`GITHUB_DISPATCH_TOKEN`, a fine-grained token allowed to dispatch to this repo) is a Worker secret, not a GitHub secret.

## One-time setup still needed
1. `age-keygen -o ~/growgen-backup.agekey` on an offline machine; store the private key in a password manager; `gh secret set BACKUP_AGE_RECIPIENT --env production` with the `age1...` line (public).
2. Optionally add required reviewers to the `production` environment. Note this also blocks the nightly production rebuild and backup until approved; if you want those unattended, leave the environment without reviewers and rely on manual dispatch for risky changes.
3. The Cloudflare token needs Workers Scripts edit on the account. Hyperdrive and KV ids are baked into `wrangler.jsonc`; the production Hyperdrive and KV are created at CUT-1 (the top-level config still has placeholder ids, so a production deploy fails until then).

## Restore
```
age -d -i ~/growgen-backup.agekey growgen-production-<ts>.dump.age > restore.dump
pg_restore --no-owner -d "$TARGET_POOLER_URL" restore.dump
```

## Notes
- `emdash migrate --check` needs no fingerprint; applying non-interactively does. `web-deploy` with `apply_migrations` parses the fingerprint from `--status` output (unverified against a real pending migration; check the first run).
- `web-deploy` triggers on `repository_dispatch`, which runs on the default branch's workflow file (`master`), so it is inert until this merges to the default branch. Until then use manual dispatch from the branch.
- Nothing here has been run on GitHub yet; YAML validated with yaml-lint and actionlint 1.7.7.
