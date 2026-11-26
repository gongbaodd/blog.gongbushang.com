# Admin runbook: local EmDash admin (D12, INF-7)

The deployed Worker serves **static pages only**. The EmDash admin cost 5–15 ms CPU per request on Workers Free (limit 10 ms, `term` lists hit 1102), so the owner runs the admin **on their own Mac** against the local or production database (INF-10: there is no testing environment). A deployed Worker answers `/_emdash/*` and `/.well-known/oauth*` with a bare 404.

> **SEC-07: edit production with the Docker admin, not this launcher.** `pnpm admin:production` runs `astro dev`, and in dev mode EmDash serves `/_emdash/api/auth/dev-bypass` (an admin session with no passkey) and the `SETUP_TOKEN` gate is off, so any local process or a DNS-rebinding web page that reaches the port gets admin on the LIVE database. Use `apps/admin` ([`admin-docker.md`](./admin-docker.md)): a production Node build, no dev-bypass, setup gate and Cloudflare Access on. The launcher now refuses production unless you pass both `--yes-production` and `--unsafe-dev-server` (emergency only; it prints a warning, and `apps/web`'s middleware 404s dev-bypass whenever `SITE_ENV=production`). `pnpm admin:local` is unchanged.

## Edit and publish
```
pnpm admin:local                                # local Supabase
# production: Docker admin (admin-docker.md). Emergency only:
#   pnpm admin:production -- --yes-production --unsafe-dev-server
# open http://localhost:4322/_emdash/admin  (localhost, not 127.0.0.1: passkeys are bound to the hostname; the script prints it)
pnpm admin:stop                                 # when done
```
1. Edit in the admin; **Publish** fires the `rebuild-on-publish` plugin, which POSTs a GitHub `repository_dispatch` (`emdash-publish`).
2. GitHub Actions `web-deploy` rebuilds the static site from the database and deploys it (a couple of minutes). Nightly rebuild also runs.
3. Check `gh run list --workflow web-deploy` or the Actions tab. Drafts and saves do not dispatch.

Publishing in `admin:production` dispatches `environment: production` and `web-deploy` rebuilds production (the only target). `admin:local` never dispatches. The rebuilt site stays noindex (and without analytics/ads) until the `PUBLIC_SITE_LIVE` variable is `true` (CUT-1), see ci.md.

## Which database am I editing
| Command | Database | Source of the URL |
|---|---|---|
| `admin:local` | `supabase start` Postgres, `127.0.0.1:54322` | built in (override `SUPABASE_LOCAL_DB_URL` in `.env`) |
| `admin:production` | production session pooler (project `ckpozotzgubrjbjstvjg`, formerly "testing") | `.env` `SUPABASE_PRODUCTION_POOLER_URL` |

Encryption key (plugin settings are encrypted with it; the wrong key cannot read them): `.env` `EMDASH_PRODUCTION_ENCRYPTION_KEY` (this is the former `EMDASH_TESTING_ENCRYPTION_KEY`, **same value**: it is bound to the data in `ckpozotzgubrjbjstvjg`, so do not rotate it without re-encrypting `options` / `_plugin_storage`); local uses `EMDASH_LOCAL_ENCRYPTION_KEY` in `.env` or `EMDASH_ENCRYPTION_KEY` in `apps/web/.dev.vars`, or none. If the variable is missing the script fails naming it and never generates one: rename the old testing entry in `.env` (GON-199), and set the same value as the `EMDASH_ENCRYPTION_KEY` Worker secret.

## What the script does (`apps/web/scripts/admin/start.mjs`)
1. `astro dev stop` for this project (Astro 7 `astro dev` is a daemon; a stale one silently serves the old DB), then checks port 4322 (`--port`) is free; it never kills a foreign process.
2. Reads the repo-root `.env` (and `.dev.vars`, read only; **never modified**) and writes `apps/web/.dev.vars.admin-<env>` (gitignored, 0600) with the env's DB URL, key and `SITE_ENV`, plus pass-through `CLOUDINARY_*` and `GITHUB_DISPATCH_*`.
3. Starts `astro dev --background` with `CLOUDFLARE_ENV=admin-<env>` (blocks in `wrangler.jsonc`). Wrangler reads `.dev.vars.<CLOUDFLARE_ENV>` **instead of** `.dev.vars`, which is the only reliable way for the env to win: the Astro Cloudflare adapter copies every `.dev.vars` entry into `process.env`, overriding an exported `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
4. **Probe**: requests a unique non-existent path (`/zz-admin-probe-<nonce>`); EmDash logs the 404 into `_emdash_404_log` of the database it uses; the script looks for that nonce in the **intended** database. Not found means the server reads another DB: the server is stopped and the script exits non-zero. (Cannot be done from Postgres alone: Supavisor rewrites `application_name` and query text.) It leaves one 404-log row in the target DB per start, which is harmless.
5. Prints the admin URL. Secrets and DB URLs are never printed (output is redacted).

`pnpm admin:stop` stops the daemon and deletes the generated files. Logs: `pnpm --filter web exec astro dev logs`.

## Publish dispatch (`GITHUB_DISPATCH_TOKEN`, `GITHUB_DISPATCH_REPO`)
The plugin reads them from the Worker `env` (dev: the generated `.dev.vars.admin-<env>`), falling back to `process.env`. The script fills them from, in order: `apps/web/.dev.vars`, then repo-root `.env` (wins). **The owner fills the values.** Recommended: put `GITHUB_DISPATCH_TOKEN` (fine-grained PAT, Contents: write on the repo) and `GITHUB_DISPATCH_REPO=gongbaodd/blog.gongbushang.com` in the repo-root `.env`, so one place serves both envs. `GITHUB_API_URL` (fake GitHub for tests) is honoured **only** for `admin:local`; production always dispatches to the real GitHub. Without a token the script prints `NO GITHUB_DISPATCH_TOKEN` and publish silently skips the rebuild. As of INF-7 the token is empty everywhere, so nothing has been dispatched end to end yet (QA-2).

Scheduled posts are published by the cron on the **deployed** Worker, which has no dispatch token, so they appear after the next nightly rebuild unless you set `GITHUB_DISPATCH_TOKEN` as a Worker secret (`wrangler secret put GITHUB_DISPATCH_TOKEN -c wrangler.jsonc`, run inside `apps/web`).

## Safety
- Production is destructive and deprecated here (SEC-07): the script refuses without `--yes-production --unsafe-dev-server`. Take a `pg_dump` first for big edits (`web-guards` already keeps a daily encrypted dump for 14 days).
- First start against a fresh or old DB applies EmDash migrations automatically. Normal flow: migrate through CI (`web-deploy` with `apply_migrations`) before editing in production.
- Cloudinary uploads from the admin need `CLOUDINARY_*` (copied from `.dev.vars` or `.env`).
- The generated file stays until `admin:stop` so a wrangler restart never falls back to `.dev.vars` (which may point at the local DB).
- Local builds: `pnpm deploy:production:build` runs `scripts/admin/check-build-env.mjs` and refuses when `apps/web/.dev.vars` sets the Hyperdrive connection variable (the adapter would let it override the production database; there is no `env.production` block, so there is no `.dev.vars.production` escape hatch). Move `.dev.vars` aside for the build. Unlike PR CI this build WRITES the derived cache (embeddings etc.), as intended.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `missing <VAR> in .env` | add that variable; for production the key must be created deliberately |
| `port 4322 is still in use` | something else (not this project's daemon) listens; stop it or `--port 4333` |
| `PROBE FAILED ... not logged in the <env> database` | stale daemon or wrong env; `pnpm admin:stop`, re-run. Never edit content until the probe passes |
| Admin loads but images fail | `CLOUDINARY_*` missing in `.env` / `.dev.vars` |
| `wrangler tail` shows `/_emdash/*` hits on the deployed Worker | expected: they return 404 in ~1 ms CPU (asset misses still invoke the Worker) |
