# CI runbook (INF-4, INF-6, INF-8)

Three workflows under `.github/workflows/`. Legacy `e2e.yml` and `sync-content.yml` are untouched. web-ci runs on every PR to master, because `web` is a required check: a workflow-level `paths` filter would leave PRs outside those paths waiting on `web` forever. Its `changes` job filters instead, and legacy-only changes (`src/`, other `packages/*`), docs and unrelated workflows skip the `web` job (a skipped job passes the required check). Never add a workflow-level `paths` filter to a workflow that holds a required check. Build happens in GitHub Actions, never in Workers Builds.

| Workflow | Triggers | Environment | What it does |
|---|---|---|---|
| `web-ci.yml` | PR to `master` touching `apps/web/**`, `supabase/**`, lockfile, `packages/shiki-plantuml`, `web-*.yml`; manual | `ci-readonly` (`DATABASE_POOLER_URL` only) | vitest, `astro check`, read-only `emdash migrate --from-config --check`, build with `DERIVE_READONLY=1`, empty-build guard, URL parity, size guard (`wrangler deploy --dry-run`). **No deploy step.** Fork PRs are skipped (no secrets). |
| `web-deploy.yml` | push to `master` (paths: `apps/web/**`, `supabase/**`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `packages/shiki-plantuml/**`, the workflow file; never applies migrations), `repository_dispatch` `emdash-publish`, nightly 02:17 UTC, manual (`apply_migrations`) | `production` (only target; a dispatch or input naming anything else, such as a stale `testing`, fails the `target` job) | optional migration apply, full (writing) build, guards, deploy |
| `web-guards.yml` | daily 03:41 UTC (production backup), daily 06:11 UTC (Cloudinary usage), manual | `production` (backup) | `pg_dump -Fc --schema=public` of production piped through `age`, uploaded as artifact `production-db-backup`, retention 14 days. The nightly connection also keeps the single Free Supabase project from pausing (there is no separate keep-alive job since INF-10). |

## PR builds read the production database but never write to it (INF-10)
There is no throwaway `testing` database any more, so `web-ci` builds against production. `pnpm --filter web build` runs `derive`, which normally writes the `derived.*` cache (hints, embeddings, colours, geocodes, traces, UMAP state) and may spend Workers AI quota. PR builds therefore run with `DERIVE_READONLY=1` (job-level env in `web-ci.yml`), which:
1. opens the derive Postgres session with `default_transaction_read_only = on`, so any stray write fails loudly;
2. turns every cache write (`saveHints`, `upsert*`, `prune*`, `saveUmapState`) into a no-op;
3. forces cache hits only (`DERIVE_EMBED=skip`, `DERIVE_SKIP_COLORS=1`) and removes the Workers AI and geocoding credentials from the process environment.

### Data guards: PR CI versus deploy (GON-219)
PR CI still reads live production data, so a production data change can affect a PR. To stop an in-progress import from turning unrelated PRs red, `web-ci` sets `DERIVE_MEDIA_GUARD=warn`: zero podcast episodes or zero gallery images become a `::warning::` annotation instead of an error. What stays hard in PR CI: zero published posts, the `runtime init failed` and page/post-count guards, URL parity (a missing podcast or gallery page still fails it), `migrate --check` and the size guard. `web-deploy` never sets the variable, so a deploy and the nightly rebuild still refuse an empty podcast/gallery. A reviewer should read the annotation: a warning on a PR that touches podcast or gallery code is a real problem.
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
| `BACKUP_AGE_RECIPIENT` (age public key `age1...`) | **missing, must be created** | web-guards backup (must match `^age1[0-9a-z]{58}$`, else the job fails) |
| `BACKUP_DATABASE_URL` (session pooler URL of the read-only `growgen_backup` role, SEC-11) | **to create** (until then the backup uses `DATABASE_POOLER_URL` with a warning) | web-guards backup |

Environment **variable** `EMDASH_TARGET_FINGERPRINT` on `production` (SEC-11): the expected EmDash target fingerprint for `web-deploy` `apply_migrations`. Without it (or the `target_fingerprint` dispatch input) applying migrations fails by design.

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

## First runs from `master` (GON-151, 2026-11-26)
- `web-deploy` manual (run 45900007049): green. 1813 pages and 996 posts prerendered, `growgen-web` uploaded, `next.growgen.xyz` still sends `x-robots-tag: noindex, nofollow` and a disallow-all `robots.txt`.
- `web-deploy` dispatch (run 45900557524): green, target `production`, `growgen-web` uploaded. It was an `emdash-publish` event sent by hand (`gh api repos/{owner}/{repo}/dispatches -f event_type=emdash-publish -F 'client_payload[environment]=production'`) tests the workflow side. The plugin → GitHub hop is only tested by a real publish in the admin.
- `web-guards` manual (run 45900010506): **both jobs failed on secrets**, not on code:
  - `backup-production`: `BACKUP_AGE_RECIPIENT` did not match `^age1[0-9a-z]{58}$`. The job now strips whitespace first (a trailing newline from `gh secret set < file`) and logs the length. Fix: `age-keygen -y ~/growgen-backup.agekey | gh secret set BACKUP_AGE_RECIPIENT --env production`. If the log says it holds a private key, rotate the key pair.
  - `cloudinary-usage`: HTTP 403 from `GET /v1_1/<cloud>/usage`. The error now includes Cloudinary's message (key and secret redacted). A 403 usually means the API key has a restricted role without Admin API access, or it belongs to another product environment. Fix: in Cloudinary, Settings, API Keys, use a key with Admin API (usage) access for cloud `dmq8ipket` and reset the three `CLOUDINARY_*` repository secrets.

## One-time setup still needed
1. `age-keygen -o ~/growgen-backup.agekey` on an offline machine; store the private key in a password manager; `gh secret set BACKUP_AGE_RECIPIENT --env production` with the `age1...` line (public).
2. Optionally add required reviewers to the `production` environment. Note this also blocks the nightly production rebuild and backup until approved; if you want those unattended, leave the environment without reviewers and rely on manual dispatch for risky changes.
3. The Cloudflare token needs Workers Scripts edit on the account (and, for the custom-domain route in `wrangler.jsonc`, Workers Routes / DNS edit on the `growgen.xyz` zone). The Hyperdrive and KV ids are baked into `wrangler.jsonc` (the promoted former testing resources).
4. Create the GitHub environment `ci-readonly` (no reviewers, no branch restriction) with one secret, `DATABASE_POOLER_URL`: the session-pooler URL of the SELECT-only role `growgen_ci_readonly` (see "Read-only CI role" below; until it exists, the production URL). It must not hold the Cloudflare token.
5. Set the repository/environment variable `PUBLIC_SITE_LIVE` only at CUT-1.
6. SEC-11: create `BACKUP_DATABASE_URL` (backups.md "Least-privilege backup role") and set `EMDASH_TARGET_FINGERPRINT` on `production` (Notes below).
7. SEC-11: branch protection or a ruleset on `master` (done: rulesets `growgen` and `protect-deploy-branches` target the default branch; `feat/emdash` was retired in GON-231): Settings -> Rules -> Rulesets -> New branch ruleset, target `master`, enable "Restrict deletions", "Block force pushes", "Require a pull request before merging" and "Require status checks to pass" (`web`), with no bypass list. This stops the `GITHUB_DISPATCH_TOKEN` (Contents: write) from pushing straight to deploy branches. Give that PAT an expiry and scope it to this repo only.

## Read-only CI role (SEC-11, owner-only)
`supabase/roles/growgen_ci_readonly.sql` creates `growgen_ci_readonly`: `LOGIN NOINHERIT NOBYPASSRLS`, `default_transaction_read_only = on`, `CONNECT`, and SELECT on **only the tables the PR build reads**, each with a SELECT-only RLS policy for this role (`growgen_ci_readonly_select`). The list was measured on local Supabase (GON-198): `emdash migrate --check` plus a full `DERIVE_READONLY=1` build run as the role with `log_statement=all` (and `pg_stat_user_tables` counters diffed); every table named in a statement is listed, and the CI steps then pass with only these grants: `_emdash_collections`, `_emdash_fields`, `_emdash_migrations`, `_emdash_migrations_lock`, `options`, `_plugin_state`, `_emdash_redirect_state`, `_emdash_redirect_artifacts`, `_emdash_redirect_generation_artifacts`, `_emdash_bylines`, `_emdash_content_bylines`, `taxonomies`, `content_taxonomies`, `media`, `_emdash_seo` (GON-203), every `ec_*` collection and `derived.*`. Users, credentials, sessions, API/OAuth tokens, device codes, plugin storage and audit logs get no grant and no policy, so they are denied.

Granted does not mean secret-free, so two tables are handled specially:
- **`options`** holds secrets next to site settings (`emdash:preview_secret`, `emdash:ip_salt`, `emdash:passkey_pending:*`, `plugin:*`). Its policy is an allow-list on `name`: the `site:` prefix plus the 10 exact keys the build was measured to read (bind parameters in the `log_statement=all` log). The secret rows are invisible to the role.
- **`ec_*`** holds drafts and scheduled entries, and `media` lists every upload. **PR CI can therefore read unpublished and scheduled content.** This is accepted: PR builds run only for this repo's own branches (fork PRs get no secrets), the build output is never deployed or uploaded, and the role cannot write.

`supabase/roles/check_ci_readonly.sql`, run **as the role**, fails if a secret `options` row, an `options` row outside the allow-list, or any auth/token/session table is readable. There are no default privileges: **re-run the script after adding a collection or a derived table** (a PR build that shows an empty collection or fails with `permission denied for table X` means X must be added: check what X holds first, and if it mixes secrets with build data, give it a row allow-list like `options`). Not a migration; never applied by agents or CI.
1. `psql "$SUPABASE_PRODUCTION_POOLER_URL" -v ON_ERROR_STOP=1 -f supabase/roles/growgen_ci_readonly.sql` (last row `t | f | f | f | t | f | f | f | f`).
2. `psql "$SUPABASE_PRODUCTION_POOLER_URL" -c '\password growgen_ci_readonly'` with `openssl rand -hex 32`.
3. `gh secret set DATABASE_POOLER_URL --env ci-readonly` with `postgresql://growgen_ci_readonly.<project-ref>:<password>@<pooler-host>:5432/postgres`.
   Then `psql "<that URL>" -v ON_ERROR_STOP=1 -f supabase/roles/check_ci_readonly.sql` must print `ci-readonly ok`.
4. Re-run the latest `web-ci` and check migrate-check, build, empty-build guard and parity pass.

## Claude Code from GitHub (`claude.yml`, GON-228)
`claude.yml` runs `anthropics/claude-code-action`, pinned to commit `4d75e5f390ee76b2e09c1980ecc99ff3a2e088c8` (tag `v1.0.275`, 2026-11-12; resolved with `gh api repos/anthropics/claude-code-action/git/ref/tags/v1.0.275`, then the annotated tag object). Bump it the same way.

| Job | Starts when | Permissions | Limits |
|---|---|---|---|
| `claude` | an `@claude` comment, review, review comment, or new/assigned issue (body or title) | `contents: write`, `pull-requests: write`, `issues: write`, `id-token: write` | 20 min, `--max-turns 25`, allow-listed tools |
| `review` | a PR comment starting with `@claude review` (on request, never on push) | `contents: read`, `pull-requests: write`, `issues: write`, `id-token: write` | 15 min, `--max-turns 15`, read-only tools (no Edit/Write) |

Trigger rules:
- Every job requires `author_association == 'OWNER'` on the comment, review or issue. Other users, bots and outside accounts never start a job. The action also checks the actor has write access and skips fork PRs (`allow_fork_prs`, `allowed_bots` and `allowed_non_write_users` are deliberately unset). Review events additionally require the PR head to be in this repo.
- The only secret is the repository secret `CLAUDE_CODE_OAUTH_TOKEN` (the owner's Claude subscription, no paid API key). The workflow has no `environment:`, so it cannot see `DATABASE_POOLER_URL`, Cloudflare, Supabase or Cloudinary secrets.
- There are no `run:` steps. Comment, issue and review text is never interpolated into a script; it only reaches the action through its event payload. The prompt tells Claude to treat that text as untrusted.
- Claude must not push to `master` (protected). It works on a `claude/<topic>` branch and opens a PR into `master`. `git push --force`, pushes to `master`, `WebFetch` and `WebSearch` are denied. There is no `--dangerously-skip-permissions`.
- Concurrency: one run per issue/PR number, queued, not cancelled.
- A PR opened with the workflow token does not start other workflows, so the required `web` check will not run until the owner pushes an empty commit or closes and reopens the PR.

Owner setup (GON-229): install the Claude GitHub App on the repo, then `claude setup-token` locally and `gh secret set CLAUDE_CODE_OAUTH_TOKEN` (repository secret). Test:
1. Comment `@claude say hello` on a test issue: the job runs and Claude replies.
2. Comment `@claude` from a non-owner account (or on a fork PR): no `claude` job starts.
3. Comment `@claude review` on a PR: the `review` job posts a review and changes no files.
4. Open the run log: only `CLAUDE_CODE_OAUTH_TOKEN` is masked; no environment secrets appear.
Validated with actionlint only; not run on GitHub yet.

## Restore
```
age -d -i ~/growgen-backup.agekey growgen-production-<ts>.dump.age > restore.dump
pg_restore --no-owner -d "$TARGET_POOLER_URL" restore.dump
```

## Notes
- `emdash migrate --check` needs no fingerprint; applying non-interactively does. `web-deploy` with `apply_migrations` takes the expected fingerprint from the `target_fingerprint` dispatch input, else the `production` environment variable `EMDASH_TARGET_FINGERPRINT` (SEC-11). It never scrapes it from the target database (that would migrate whatever `DATABASE_POOLER_URL` points at), and it fails if neither is set. Get the value once from `emdash migrate --from-config --status` on a trusted machine after checking the printed host (supabase.md "Migrate"), then `gh variable set EMDASH_TARGET_FINGERPRINT --env production --body <fp>`.
- Actions in `web-*.yml` are pinned to full commit SHAs with a `# vX.Y.Z` comment (SEC-10), resolved with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (for an annotated tag, follow `.object.sha` with `gh api repos/<owner>/<repo>/git/tags/<sha>`). Bump them the same way, never back to a mutable tag. The legacy `e2e.yml` and `sync-content.yml` are not pinned.
- `web-deploy` triggers on `repository_dispatch`, which runs on the default branch's workflow file (`master`), so it is inert until this merges to the default branch. Until then use manual dispatch from the branch.
- Nothing here has been run on GitHub yet; YAML validated with yaml-lint and actionlint 1.7.7.

## Required checks that never report (GON-246)
**The failure.** A required check waits forever when its workflow never starts on a PR. On 2026-11-27 `web-ci.yml` had a workflow-level `paths:` filter, so PRs outside those paths (#207, #208, #214, #215) sat on a `web` check that was never created. GitHub shows it as "Expected: waiting for status".

**The rule.** A workflow that produces a required check:
1. triggers on `pull_request` with no `paths:`, `paths-ignore:` or `branches-ignore:`, and `branches:` only if it still matches `master`;
2. decides what to skip inside the workflow: a cheap `changes` job computes an output, the real job has `needs: changes` and a job-level `if:`. A job skipped by `if:` still reports (as skipped) and satisfies a required check. See `web-ci.yml` (`changes` -> `web`);
3. keeps the job name equal to the ruleset's check name (`name:` if set, else the job id).
`push`, `schedule` and `workflow_dispatch` triggers may filter freely; only `pull_request` matters.

**Enforcement.**
- `required-check-guard` job in `web-ci.yml` runs `node scripts/check-required-checks.mjs` on every PR (no secrets, no install, never path-filtered; `web` does not depend on it, and it is deliberately not itself a required check). It fails when a name in `.github/required-checks.json` matches no job, the producing workflow has no `pull_request` trigger, or the trigger has a filter that can exclude a PR to `master`. Its tests are `scripts/check-required-checks.test.mjs` (run with `node --test`).
- When the token can read the ruleset (`gh api repos/<repo>/rulesets/28165746`), the script also compares the checked-in list with the live ruleset; with the default `GITHUB_TOKEN` it logs a warning and uses the checked-in list only. Run it locally with `GITHUB_REPOSITORY=gongbaodd/blog.gongbushang.com node scripts/check-required-checks.mjs` after `gh auth login` for the full comparison.
- `required-check-alarm.yml` (hourly, `GITHUB_TOKEN` only) lists open non-draft PRs to `master` and, when a required check has no check run or status on the head SHA more than 60 minutes after the head commit, posts one PR comment per head SHA (hidden marker `<!-- required-check-alarm:<sha> -->`) plus a `::warning::` in the run log. Manual run: Actions, `required-check-alarm`, `dry_run` (default on, prints only). Limitation: the age is the head commit's committer date, so a PR with an old commit that was just reopened may be flagged on its next hourly run.

**If a PR is stuck on a required check.** 1) Open the PR's Checks tab; if `web` is missing, check whether `web-ci` ran at all. 2) Look for a workflow-level filter on `master`: `pull_request` triggers use the workflow file from the PR's merge result, so fix the filter in a PR that itself reports (the guard job runs on every PR), merge it, then push an empty commit to the stuck PRs. 3) As owner, an admin merge is the last resort.

**Adding a new required check safely.**
1. Put the job in a workflow that triggers on `pull_request` to `master` without filters; use the `changes` + `needs` + job-level `if:` pattern for any path logic. Give the job a stable `name:`.
2. Let it run on a PR at least once so the check name exists.
3. Add the name to `checks` in `.github/required-checks.json` in the same PR.
4. After merge, add it to ruleset `protect-deploy-branches` (id 28165746): Settings, Rules, Rulesets, "Require status checks to pass". Confirm with `gh api repos/gongbaodd/blog.gongbushang.com/rulesets/28165746 --jq '.rules[]|select(.type=="required_status_checks")'`.
5. To rename or remove a required job, do it in an order that never leaves a required name without a producer: add the new name to the ruleset, merge the rename, then remove the old name.
