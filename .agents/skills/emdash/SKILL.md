---
name: emdash
description: >-
  EmDash CMS migration apps: apps/web (public Astro site on Cloudflare Workers with Hyperdrive),
  the derive pipeline that writes the Supabase derived schema, apps/admin (Dockerized Node admin
  with Cloudflare Access), environments, the Supabase RLS lockdown (SEC-01) and roles.
  Use when editing apps/web, apps/admin, apps/web/scripts/derive, apps/web/scripts/schema,
  supabase/, or docs/plan/emdash/.
---

# EmDash apps (`apps/web`, `apps/admin`, `supabase/`)

The EmDash migration replaces the legacy `src/` Astro site (see the legacy notes in `AGENTS.md`).
Plan, story IDs and decisions D1-D13 live in Linear (project `P-GON-6`). Runbooks and reports are in `docs/plan/emdash/`.
Before changing anything, read `docs/plan/emdash/AGENT_RULES.md`.

## Hard rules

- **Free plans only.** Cloudflare Workers Free (10 ms CPU per invocation, 64 MiB script, 20,000 static files, 100k requests/day), Supabase Free (500 MB, IPv4 session pooler only, 7-day pause), Cloudinary (25 credits). No R2, no Cloudflare Images.
- **URLs never change.** Public paths must match `apps/web/tests/legacy-urls.txt`. Check with `pnpm --filter web parity`.
- **Secrets stay out of the bundle.** Read them from the repo-root `.env`, `apps/web/.dev.vars`, wrangler secrets or GitHub environment secrets. Refer to them by name only.
- **Environments are `local` and `production` only** (INF-10 retired `testing`). `SITE_ENV=testing` is refused at startup.
- **Production is not public** until the owner sets `PUBLIC_SITE_LIVE=true` (CUT-1). Until then the site is `noindex`, disallows all robots, and runs no analytics or ads.

## apps/web (public site)

- Package name `web`. Astro with `output: "server"`, `@astrojs/cloudflare` (`imageService: "passthrough"`), and `emdash/astro`.
- Database: `hyperdrive({ binding: "HYPERDRIVE" })` from `@emdash-cms/cloudflare`. Media is Cloudinary only (`localMedia` disabled, D6).
- Content model: `apps/web/scripts/schema/apply.mjs` (wrapper `apply.sh`). It is idempotent and creates the `posts`, `podcasts` and `gallery` collections plus the `category` and `tag` taxonomies. It never alters existing fields.
  - `apps/web/scripts/schema/apply.sh -u <url> --check` is a dry run (exit 1 if changes are pending). Drop `--check` to apply.
  - Auth: `--token` or `EMDASH_TOKEN`, or `EMDASH_HEADERS` for Cloudflare Access service tokens.
- Seed: `apps/web/seed/seed.json` (named in `package.json` under `emdash.seed`).
- `build` runs `derive` first, then `check-static-routes`, `astro build`, `post-build` and `generate-pdfs`.

## Derive pipeline (`apps/web/scripts/derive/`)

Derive computes data that EmDash does not store (embeddings, relates, UMAP, colours, geocodes, traces). It writes only the Supabase `derived` schema.

- Reads EmDash content with plain SQL inside a `READ ONLY` transaction.
- Migrations: `supabase/migrations/20261125000000_derived_schema.sql` and `20261125010000_derived_podcast_gallery.sql`. Apply with `pnpm --filter web derive:migrate` (it applies every `*_derived_*.sql`).
- Tables: `post_embeddings`, `cover_colors`, `geocodes`, `post_hints`, `umap_state`, `podcast_embeddings`, `gallery_traces`.
- **`DERIVE_READONLY=1`**: no cache writes and no embeddings. Used by PR CI against production (INF-10). The SQL session is `default_transaction_read_only`.
- **Frozen gallery traces**: 75 legacy traces live in `derived.gallery_traces` and are never recomputed. A new gallery image gets a placeholder SVG (flat rect in `bgColor`), and placeholders are not stored. Seed with `derive:seed:media -- --write` before the first build of an environment.
- **Embeddings via Workers AI**: model `@cf/qwen/qwen3-embedding-0.6b` (1024-d). `DERIVE_EMBED_PROVIDER` is `auto` (default), `workers-ai` or `local`. Credentials are `CF_ACCOUNT_ID` and `CF_AI_TOKEN`, a token scoped to Workers AI only. Never reuse `CLOUDFLARE_API_TOKEN` (the deploy token). `DERIVE_EMBED` is `require`, `skip` or `fake`.
- Tests: `pnpm --filter web exec vitest run scripts/derive`.

## apps/admin (Dockerized Node admin)

- Package name `admin`. `@astrojs/node` in standalone mode, served by `node scripts/start.mjs` on port 4322 (`HOST=0.0.0.0` in the container). Never run `astro dev` in a container.
- Files: `apps/admin/Dockerfile`, `docker-compose.yml`, `.env.example`. The build context is the monorepo root.
- **Cloudflare Access JWT check**: `src/access.ts` and `src/outer.ts`. When `CF_ACCESS_AUD` is set, every request except `/healthz` and `/robots.txt` needs a valid `Cf-Access-Jwt-Assertion` (RS256). Set `CF_ACCESS_TEAM_DOMAIN` as well. The check runs before any EmDash middleware.
- **Fail closed**: a production target with missing Access config answers 503. Access is mandatory for production unless the server listens on loopback only.
- **Setup gate**: `src/middleware.ts`. `SETUP_TOKEN` unset or empty means `/_emdash/admin/setup` and `/_emdash/api/setup` return 404. Set it only briefly to create a fresh database. Remove it afterwards.
- **`pnpm --filter admin check:secrets`** runs `scripts/check-import-meta-env.mjs` (static guard) and then `scripts/check-no-baked-secrets.mjs` (canary build). Every new runtime variable goes into `.env.example`.
- Other checks: `pnpm --filter admin typecheck`, `test`, `build`, `smoke` (`scripts/smoke.mjs`).
- Runtime safety rules: `scripts/safety.mjs` and `scripts/start.mjs`. A remote database must match `SUPABASE_PRODUCTION_REF`. `ADMIN_CONFIRM_PRODUCTION=yes` is required for production. Remote DB TLS is always verified.

### Local-admin launcher (apps/web, host-native)

`pnpm admin:local` and `pnpm admin:production` (`apps/web/scripts/admin/start.mjs`) run `astro dev` on the Mac. Dev mode enables a dev bypass and turns the setup gate off, so **production edits go through `apps/admin` (Docker), not this launcher** (SEC-07). `pnpm admin:stop` stops it.

## Supabase: lockdown and role order (SEC-01, SEC-11)

- Layer 1 is a Dashboard setting: turn the Data API off for project `ckpozotzgubrjbjstvjg` (or empty the exposed schemas). `supabase/config.toml` mirrors this with `[api] enabled = false`.
- Layer 2 is `supabase/migrations/20261125020000_lockdown_public_rls.sql`. It enables RLS on every `public` and `derived` table and revokes `anon` and `authenticated` privileges. It is idempotent and not run by `derive:migrate`.
- **Re-run order after every `emdash migrate`:**
  1. `emdash migrate` (with `--expected-target-fingerprint`, see `supabase.md`)
  2. `supabase/migrations/20261125020000_lockdown_public_rls.sql`
  3. `supabase/roles/growgen_ci_readonly.sql`, then `supabase/roles/check_ci_readonly.sql` run as that role (it must print `ci-readonly ok`)
- `supabase/roles/growgen_backup.sql` is owner-only, applied once. It holds `BYPASSRLS` so `pg_dump` can read through RLS. Neither role file contains a password. Set it with `\password` in psql.
- Verify lockdown with the two queries in `docs/plan/emdash/runbooks/supabase.md` section 3. Both must return 0 rows.

## Commands (all names exist in the package.json scripts that they come from)

Root `package.json`:

```bash
pnpm admin:local             # host-native admin on local Supabase (apps/web launcher)
pnpm admin:production        # same, against production (refuses without confirmation)
pnpm admin:stop
pnpm db:start                # supabase start (trimmed service list)
pnpm db:stop
pnpm db:reset                # supabase db reset
pnpm content:pull            # copy content between local and production (INF-5)
pnpm deploy:production:build # refuses a .dev.vars that sets the Hyperdrive variable
pnpm deploy:production:dry-run
```

`apps/web/package.json` (use `pnpm --filter web <script>`):

```bash
pnpm --filter web dev
pnpm --filter web build                  # derive, check-static-routes, astro build, post-build, pdfs
pnpm --filter web deploy                 # build, then wrangler deploy
pnpm --filter web derive                 # what build runs first
pnpm --filter web derive:migrate
pnpm --filter web derive:seed            # dry run; add -- --write to apply
pnpm --filter web derive:seed:media -- --write
pnpm --filter web derive:compare-embeddings -- 20
pnpm --filter web parity                 # URL parity against legacy-urls.txt
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web types:emdash
pnpm --filter web test:e2e
```

`apps/admin/package.json`:

```bash
pnpm --filter admin dev        # host-native only, never in the container
pnpm --filter admin build
pnpm --filter admin start      # production entry, runs scripts/start.mjs
pnpm --filter admin smoke      # run against local Supabase only
pnpm --filter admin check:secrets
pnpm --filter admin typecheck
pnpm --filter admin test
```

Non-script entry points: `apps/web/scripts/schema/apply.sh` and `apps/web/scripts/import/mig7/catchup.mjs`. Run them with `node` or `bash` as shown in their headers.

## Runbooks (`docs/plan/emdash/runbooks/`)

- `supabase.md`: pooler hosts, `emdash migrate` fingerprint flow, RLS lockdown (SEC-01), verification queries.
- `admin-docker.md`: the Docker admin, env variables, Access, setup gate, `check:secrets`.
- `admin.md`: host-native `admin:local` and `admin:production`, and why production editing uses Docker.
- `data.md`: derive commands, the `derived` tables, Workers AI, gallery seed and backup, catch-up.
- `ci.md`: PR read-only builds, `ci-readonly` environment, read-only CI role.
- `backups.md`: nightly `backup-production`, `growgen_backup` role, restore drill.
- `deploy-production.md`: wrangler config, custom domain switch-over, rollback.
- `content-sync.md`: `pnpm content:pull` rules.

## Pitfalls (each one is an observed or documented failure)

- **`import.meta.env?.X` leaks secrets (SEC-02).** Astro inlines every private variable named in a file that uses the optional-chained form. Write `import.meta.env.X` and run `check:secrets`. `PUBLIC_*` and `EMDASH_SITE_URL` are baked on purpose, so never put a secret under those names.
- **Changing a public URL breaks parity.** Run `pnpm --filter web parity` after any route, slug or template change.
- **Supabase direct host is IPv6-only on Free.** Use the session pooler on port 5432, never the transaction pooler on 6543. Get the host from `supabase link`, never by guessing.
- **Lockdown does not survive a migrate.** A new `public.*` table has RLS off until the lockdown script runs again. The CI role also needs re-running after a new collection or derived table.
- **`apps/web/.dev.vars` can override the Hyperdrive variable.** The Astro adapter copies `.dev.vars` into `process.env`. `deploy:production:build` refuses when this happens.
- **Workers CPU budget.** EmDash admin routes exceed the 10 ms Workers Free limit (`term` lists hit 1102). The public Worker answers `/_emdash/*` with a bare 404, so the admin runs only in `apps/admin` or on the owner's Mac.
- **Do not confuse the two admins.** The host-native launcher (`apps/web`, `astro dev`) has a dev bypass. The Docker admin (`apps/admin`) does not.
- **Derive writes need a real environment.** A build with `DERIVE_READONLY=1` against an unseeded `derived` schema serves placeholders for all 75 gallery traces.
