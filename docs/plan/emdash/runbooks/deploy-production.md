# Deploy runbook: production (TODO list, nothing created yet)

Top-level `apps/web/wrangler.jsonc` is the production config. These are placeholders until CUT-1 / INF-4 (Lead asks the owner before any resource is created).

| Item | Current state | Action at CUT-1 / INF-4 |
|---|---|---|
| Hyperdrive id | placeholder `0000...` | create the production Hyperdrive config (caching disabled), put its id in top-level `hyperdrive[0].id` |
| KV `SESSION` | placeholder `0000...` (added by FIX-1 so the binding is declared, not just injected id-less by the adapter) | create the namespace, put its id in top-level `kv_namespaces[0].id`; without it passkey sign-in fails |
| Durable Object `EMDASH_ROOMS` | `exports.EmDashRoom` (sqlite) inherited by `env.testing` (verified in `dist/server/wrangler.json`) | none |
| Secrets | none set | `EMDASH_ENCRYPTION_KEY`, `SETUP_TOKEN`, `EMDASH_SITE_URL`, `CLOUDINARY_*`, `GITHUB_DISPATCH_TOKEN` via `wrangler secret put` |
| `SITE_ENV` | top-level var `production` | production build MUST run with `SITE_ENV=production` (or `CLOUDFLARE_ENV` unset and SITE_ENV set): `scripts/post-build.mjs` fails closed (noindex + disallow-all) when neither is set |
| `robots.txt` | `src/pages/robots.txt.ts` (prerendered): allow + `Sitemap:` for production | none |
| `sitemap.xml` | prerendered stub listing `/` only | PORT-7: generate the full sitemap at build time |
| `/.well-known/oauth-*` | EmDash SSR routes outside `/_emdash/*`; static misses never reach the Worker | if OAuth/MCP discovery is needed in production, add `/.well-known/*` to `assets.run_worker_first` |
| Custom domain / routes | none | CUT-1 |

Build and deploy: `SITE_ENV=production pnpm --filter web build` then `pnpm --filter web exec wrangler deploy -c dist/server/wrangler.json` (`pnpm --filter web deploy` does both). `build` runs `scripts/check-static-routes.mjs` first (fails if any `src/pages` route lacks `prerender = true`).
