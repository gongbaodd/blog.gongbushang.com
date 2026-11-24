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
