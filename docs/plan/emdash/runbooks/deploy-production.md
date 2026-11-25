# Deploy runbook: production (TODO list, nothing created yet)

Top-level `apps/web/wrangler.jsonc` is the production config. These are placeholders until CUT-1 / INF-4 (Lead asks the owner before any resource is created).

| Item | Current state | Action at CUT-1 / INF-4 |
|---|---|---|
| Hyperdrive id | placeholder `0000...` | create the production Hyperdrive config (caching disabled), put its id in top-level `hyperdrive[0].id` |
| KV `SESSION` | placeholder `0000...` (added by FIX-1 so the binding is declared, not just injected id-less by the adapter) | create the namespace, put its id in top-level `kv_namespaces[0].id`; without it passkey sign-in fails |
| Durable Object `EMDASH_ROOMS` | `exports.EmDashRoom` (sqlite) inherited by `env.testing` (verified in `dist/server/wrangler.json`) | none |
| Secrets | none set | Worker (`wrangler secret put`): `EMDASH_ENCRYPTION_KEY` (same value as `.env` `EMDASH_PRODUCTION_ENCRYPTION_KEY`, which does **not exist yet**: create it deliberately and back it up), `EMDASH_SITE_URL`, optionally `GITHUB_DISPATCH_TOKEN` (for cron-published posts). `SETUP_TOKEN` and `CLOUDINARY_*` are no longer needed on the Worker (admin is local). Owner's repo-root `.env` needs `SUPABASE_PRODUCTION_POOLER_URL`, `EMDASH_PRODUCTION_ENCRYPTION_KEY`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_DISPATCH_REPO`, `CLOUDINARY_*` for `admin:production` |
| `SITE_ENV` | top-level var `production` | production build MUST run with `SITE_ENV=production` (or `CLOUDFLARE_ENV` unset and SITE_ENV set): `scripts/post-build.mjs` fails closed (noindex + disallow-all) when neither is set |
| `robots.txt` | `src/pages/robots.txt.ts` (prerendered): allow + `Sitemap:` for production | none |
| `sitemap.xml` | prerendered stub listing `/` only | PORT-7: generate the full sitemap at build time |
| Admin / API / `/.well-known/oauth*` | D12: locked down. `src/worker.ts` returns 404 for `/_emdash/*` and `/.well-known/oauth*` (asset misses still reach the Worker, so config alone is not enough); `assets.run_worker_first` is explicitly `false` | none. Edit content with `pnpm admin:production -- --yes-production` (`admin.md`) |
| Dispatch target | `web-deploy` maps `repository_dispatch` to **testing** only | after publishing in `admin:production`, run `gh workflow run web-deploy -f environment=production` (or wait for the nightly); better: the plugin sends `client_payload.environment` and the workflow honours it |
| Custom domain / routes | none | CUT-1 |

Build and deploy: `SITE_ENV=production pnpm --filter web build` then `pnpm --filter web exec wrangler deploy -c dist/server/wrangler.json` (`pnpm --filter web deploy` does both). `build` runs `scripts/check-static-routes.mjs` first (fails if any `src/pages` route lacks `prerender = true`).
