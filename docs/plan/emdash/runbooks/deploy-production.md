# Deploy runbook: production (INF-10: the only remote environment)

Top-level `apps/web/wrangler.jsonc` is the production config. The former `testing` resources were promoted to production by INF-10; deploys run in GitHub Actions (`web-deploy.yml`), or locally with `pnpm deploy:production:build` then `wrangler deploy` (see below). Nothing here is deployed by the agents: every step marked OWNER needs the owner's go-ahead (GON-199).

| Item | State | Notes |
|---|---|---|
| Hyperdrive `319cee5eca8a4c47a00b2091cff565f3` | in `wrangler.jsonc` | points at Supabase `ckpozotzgubrjbjstvjg` (caching disabled), the former testing config |
| KV `SESSION` `55d3e3f70475477a9eef931679726407` | in `wrangler.jsonc` | passkey sessions |
| Durable Object `EMDASH_ROOMS` | `exports.EmDashRoom` (sqlite) at the top level | none |
| `workers_dev` / `preview_urls` | `false` / `false` (SEC-12) | no `*.workers.dev` or preview URL: the Worker is reachable only through the custom domain |
| Custom domain | `routes: [{ pattern: "next.growgen.xyz", custom_domain: true }]` (config only) | `next.growgen.xyz` is **already live**, served by the `growgen-web-testing` Worker (version 2027c095, deployed 2026-11-25; 200, `x-robots-tag: noindex`, robots `Disallow: /`), with the domain attached outside wrangler.jsonc. A custom domain can belong to only one Worker, so follow the switch-over order below. INF-10 deployed nothing and touched no DNS or domain |
| Secrets (`wrangler secret put ... -c wrangler.jsonc`, run in `apps/web`) | **OWNER** | `EMDASH_ENCRYPTION_KEY` (the existing key already bound to `ckpozotzgubrjbjstvjg`: same value as `.env` `EMDASH_PRODUCTION_ENCRYPTION_KEY`; do not rotate, `options` / `_plugin_storage` are encrypted with it), `EMDASH_SITE_URL` (`https://next.growgen.xyz`), optionally `GITHUB_DISPATCH_TOKEN` (cron-published posts). `SETUP_TOKEN` and `CLOUDINARY_*` are not needed on the Worker (admin is local) |
| `SITE_ENV` | var `production` | only selects the rebuild-on-publish target and the admin gates; it does **not** make the site indexable |
| `PUBLIC_SITE_LIVE` | var `"false"` in `wrangler.jsonc`; GitHub `production` environment variable (unset) | the go-live switch. While not exactly `true`: `X-Robots-Tag: noindex, nofollow`, disallow-all `robots.txt`, no analytics or ads. Flip **only at CUT-1**, by setting the GitHub variable `PUBLIC_SITE_LIVE=true` and re-running `web-deploy` (it passes the value to the build and to the Worker with `--var`). A manual `wrangler deploy` keeps `false` |
| `robots.txt` | `src/pages/robots.txt.ts` (prerendered): allow + `Sitemap:` only when live | none |
| Admin / API / `/.well-known/oauth*` | D12: locked down. `src/worker.ts` returns 404 for `/_emdash/*` and `/.well-known/oauth*` (asset misses still reach the Worker, so config alone is not enough); `assets.run_worker_first` is explicitly `false` | Edit content with `pnpm admin:production -- --yes-production` (`admin.md`) |
| Dispatch target | `web-deploy` accepts `production` only | publishing in `admin:production` rebuilds and deploys production |
| Old resources | `growgen-web-testing` Worker, GitHub `testing` environment, Supabase `epewqznhtgjirbfeqfrj` | **OWNER: delete** after `growgen-web` is deployed and verified (GON-199) |

## Switch-over of `next.growgen.xyz` (OWNER, in this order)
1. Set the `growgen-web` secrets first (`wrangler secret put ... -c wrangler.jsonc` in `apps/web`): `EMDASH_ENCRYPTION_KEY` (existing key, not rotated), `EMDASH_SITE_URL=https://next.growgen.xyz`, optional `GITHUB_DISPATCH_TOKEN`. Make sure the `PUBLIC_SITE_LIVE` GitHub variable is **not** `true` (unset or `false`) so the build keeps noindex, disallow-all robots and no analytics/ads.
2. Detach `next.growgen.xyz` from `growgen-web-testing` (Dashboard, Workers, growgen-web-testing, Settings, Domains and Routes).
3. Deploy `growgen-web` (`web-deploy` manual run; the `routes` entry attaches the domain). **Gap:** between steps 2 and 3 the domain serves nothing (a minute or so), so do them back to back.
4. Verify: `curl -sI https://next.growgen.xyz/` shows 200 and `x-robots-tag: noindex, nofollow`; `/robots.txt` is `Disallow: /`; `/_emdash/admin` is 404; the home page, a post and `/sitemap.xml` load; no Mixpanel or AdSense script in the HTML; `wrangler tail` CPU check.
5. Only after step 4 passes, delete `growgen-web-testing` (then the old Supabase project and GitHub `testing` environment, GON-199).
**Rollback** (any failure after step 2): detach the domain from `growgen-web` if attached and re-attach it to `growgen-web-testing`; its last deployment (2027c095) is untouched until step 5.

Build and deploy: `pnpm --filter web build` (add `PUBLIC_SITE_LIVE=true` only at CUT-1) then `pnpm --filter web exec wrangler deploy -c dist/server/wrangler.json` (`pnpm --filter web deploy` does both). `build` runs `scripts/check-static-routes.mjs` first (fails if any `src/pages` route lacks `prerender = true`).
