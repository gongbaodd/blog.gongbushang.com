# EmDash migration — knowledge base

Maintained by **Archivist**. Facts observed during the migration only, each dated with its story ID.

## Verified commands
- 2026-11-24 (S0-2): scaffold = `pnpm create emdash@latest web --template cloudflare:starter --pm pnpm --no-install --yes` (emdash 1.6.0, astro 7.4.13, @astrojs/cloudflare 14.4.9). Template keys are `blog|starter|marketing|portfolio` x `node|cloudflare`.
- 2026-11-24 (S0-2): migrate against Postgres: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<url> pnpm --filter web exec emdash migrate --from-config [--status|--check]`. Create content with `emdash content create posts -u http://localhost:4322 --slug hello --data '{...}'` (slug via `--slug`).
- 2026-11-24 (S0-2): wrangler in apps/web: `pnpm exec wrangler deploy --dry-run --outdir <dir> -c dist/server/wrangler.json`.
- 2026-11-24 (S0-8): run Gemini via `node ~/.claude/plugins/cache/xiaolai/cc-suite/2.5.0/scripts/agy-runner.mjs --kind agy --model <m> --sandbox read-only --timeout-ms 900000 -- "<prompt>"`; JSON result with `rawOutput`.
- 2026-11-24 (S0-2): after the root pnpm reinstall legacy unit tests (209) and legacy `astro build` stayed green.

## Gotchas
- 2026-11-24 (S0-2): `astro dev` failed `ReferenceError: require is not defined` (pg is CJS under workerd). Fix: `vite.ssr.optimizeDeps.include: ["@emdash-cms/cloudflare > pg"]` in `apps/web/astro.config.mjs`.
- 2026-11-24 (S0-2): legacy root files leak into apps/web: root `postcss.config.mjs` (Tailwind `@layer base` build error; fixed with `apps/web/postcss.config.mjs` `plugins: []`) and root `wrangler.json` ("Found both a user configuration file"; use `-c dist/server/wrangler.json`).
- 2026-11-24 (S0-2): root lockfile pinned older astro/wrangler; astro 7.3.3 lacks `astro/assets/image-asset` needed by @astrojs/cloudflare 14.4, and wrangler must be >= 4.164. Bumped in apps/web. Template's own pnpm-workspace.yaml/lockfile/`packageManager` removed (root workspace owns pnpm 10).
- 2026-11-24 (S0-2): `emdash init/seed/doctor/export-seed` are SQLite-only, unusable on Postgres.
- 2026-11-24 (S0-8): Supabase Free direct DB host is IPv6-only; use the shared pooler (session mode, port 5432, IPv4) from GitHub Actions.
- 2026-11-24 (S0-1): plan facts older than the docs go stale; see Free-tier observations (Workers limit).

## EmDash quirks
- 2026-11-24 (S0-2): runtime applies migrations and the starter seed automatically on first request via Hyperdrive `localConnectionString`; CLI migrate reads `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`; `DATABASE_URL` is only for the plain `postgres()` adapter.
- 2026-11-24 (S0-2): template auto-adds durable_objects (EMDASH_ROOMS), a `* * * * *` cron, `images`, `kv_namespaces` (SESSION) and R2 `MEDIA`; check each against free tier before deploy.

## Free-tier observations
- 2026-11-24 (S0-2): worker bundle 20.9 MiB uncompressed (671 modules), admin locale chunks ~9.1 MB; static assets 112 files.
- 2026-11-24 (S0-8): Workers Free limit is now 64 MiB uncompressed with no compressed limit (limits page modified 2026-11-19). Our earlier 3 MB assumption was wrong; the Gemini review caught it.
- 2026-11-24 (plan): Cloudinary free usage 4.42 / 25 credits (17.7%) — `cld admin usage`.
- 2026-11-24 (plan): growgen.xyz NS = `*.ns.cloudflare.com`; Supabase org has paused project `map` (free limit = 2 active).

## Rejected options (and why)
- 2026-11-24 (S0-3..6): `@emdash-cms/plugin-webhook-notifier` rejected: afterSave fires on drafts and sends no event_type, so GitHub returns 422.
- 2026-11-24 (S0-8): SSR + `cacheCloudflare()` fallback for Markdown posts rejected (KaTeX + Shiki exceed 10 ms CPU on Free). Gemini review: 15 findings, 14 accepted/partly; one partly rejected because `emdash seed` is SQLite-only.
- 2026-11-24 (plan): SQLite/D1 for local — rejected by owner; local uses Supabase so all envs share the Postgres dialect.
- 2026-11-24 (plan): Portable Text bodies — deferred (`BL-PT`); KaTeX/Mermaid/PlantUML would need custom blocks for 994 posts.

## S0-3 / S0-4 (2026-11-24)
- Verified: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<pg url> pnpm --filter web build` prerenders EmDash content in workerd (default `prerenderEnvironment`); drafts excluded; built Worker keeps the `HYPERDRIVE` binding. (S0-3)
- Gotcha: if the DB is unreachable, the build **exits 0**, logs `[emdash] runtime init failed (page renders without CMS data)`, and emits empty pages → CI needs a guard. If the env var is unset, wrangler falls back to `localConnectionString` in `wrangler.jsonc`; with neither, the build fails. (S0-3)
- Verified: `emdash schema add-field posts body_md --type text` (no CLI flag for field options); `content create --file` round-trips Markdown byte-identically. (S0-4)
- Verified: `createMarkdownProcessor()` with the legacy plugins renders KaTeX, Shiki + PlantUML, attributes, external-link rel, Cloudinary `f_auto,q_auto`, and returns headings; build-only, +27 KiB to the Worker. Mermaid uses the `astro-mermaid` client script plus a 10-line remark copy (its remark plugin isn't exported). (S0-4)
- Free tier: there is no compressed (gzip) Worker limit any more; ~5.7 MiB gzip is irrelevant. Only 64 MiB uncompressed counts. (S0-4 question, answered from the 2026-11-19 limits page)

## S0-5 / S0-6 (2026-11-24)
- EmDash quirk: custom **media providers** register via `emdash({ mediaProviders: [{id,name,entrypoint,capabilities,config}] })`; the entrypoint module exports `createMediaProvider` (same shape as `cloudflareImages()`). `storage` is optional. (S0-5)
- Gotcha: the `IMAGES` binding is injected by `@astrojs/cloudflare`, not wrangler.jsonc; drop it with `cloudflare({ imageService: "passthrough" })`. (S0-5)
- Verified: built bindings after S0-5: HYPERDRIVE, SESSION (KV), EMDASH_ROOMS (DO), ASSETS, cron `* * * * *`; `r2_buckets: []`. (S0-5)
- Hook: `content:afterPublish` signature `(event: {content, collection}, ctx)`, needs capability `content:read`. Draft saves don't fire it; explicit publish does. (S0-6)
- Gotcha: `emdash content create/update` **auto-publish** unless `--draft` is passed, which matters for MIG-1 imports. (S0-6)
- Tests: `apps/web/vitest.config.ts` (the root vitest config doesn't include apps/web); 16 tests pass. (S0-5/S0-6)

## Sprint 1 so far (2026-11-24)
- Gotcha: `supabase projects create` refuses in agent mode without `--yes`; Lead ran it with `--yes` under the owner's explicit approval. (INF-2)
- Gotcha: the two Supabase projects got **different pooler hosts** (`aws-0-…` testing, `aws-1-…` production). Get the host from `supabase link` → `supabase/.temp/pooler-url`; never guess. (INF-2)
- Verified: `emdash migrate --from-config` against a remote DB requires `--expected-target-fingerprint <fp>` (printed on the first attempt); about 2 min for 001–098 over the pooler. (INF-2)
- EmDash quirk: **no lock on the first-admin setup wizard** in 1.6.0 (first visitor wins). Mitigated by `apps/web/src/middleware.ts` SETUP_TOKEN gate; path is decoded and lowercased before matching. Verified on testing: setup, `%73etup` and `_EMDASH` variants → 404; token → 302 → 200. (INF-3)
- Verified: Hyperdrive with the **direct** IPv6-only Supabase host works at runtime on Free (admin's DB check succeeded); no pooler needed for Hyperdrive. (INF-3)
- Verified: `assets: { not_found_handling: "404-page", run_worker_first: ["/_emdash/*"] }` in `wrangler.jsonc` is inherited into `env.testing` and baked into `dist/server/wrangler.json`. Select the env at build time with `CLOUDFLARE_ENV=testing`; don't pass `--env` to deploy. (INF-3)
- Free tier: admin CPU on testing: cold requests 23–62 ms (all `ok`), warm 1–4 ms. Over the nominal 10 ms but not rejected so far; keep monitoring (QA-2). Cron set to `*/15` testing and `*/5` production. (INF-3)
- Gotcha: build against a fresh remote DB auto-seeds default collections; Postgres logs "Full-text search is only available with SQLite" (we use client minisearch). (INF-3)
- EmDash quirk: term slugs are stored verbatim (no slugify), but REST term routes don't decode path params, so `c#` can't be fetched or edited by slug in admin. Static build lists terms, so `/tag/c%23/` still builds. `unique: true` on fields is metadata only (no DB constraint): importers must look up `legacy_id` first. (CMS-1)
- Verified: MIG-0 snapshot covers 4,945 legacy paths; 995 posts (not 994); 4 `type: draft` posts are publicly built → kept published. (MIG-0)
- Gotcha: `astro check` in apps/web crashed (`Cannot read properties of undefined (reading 'fileExists')`) because it resolved TypeScript 7 (native, no JS API). Fix: pin `typescript: npm:@typescript/typescript6@^6.0.2` in apps/web devDeps, as the root does. Now 0 errors. (PORT-1)
- Gotcha: the EmDash admin CSS is Tailwind v4; our site uses Tailwind 3.4, so `apps/web/postcss.config.mjs` runs Tailwind v3 only for CSS outside `node_modules`. (PORT-1)
- Verified: the ported shell (Mantine, React islands) adds nothing to the Worker bundle (21.36 MiB, 668 modules) because everything is prerendered. (PORT-1)
