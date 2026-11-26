# FIX-1: S0-7 Gemini review findings (hydrogen-high review)

Branch `emdash/FIX-1` (from `feat/emdash`). Reviews read from commit 832303f (`reports/S0-7/*.json`; the files are not on `feat/emdash`).

| # | Finding | Verified? | Action |
|---|---|---|---|
| 1 | SSR public routes bypass Worker; 404 not prerendered | Yes (only `index` + spikes had `prerender = true`; `dist/client/404.html` missing; EmDash also injects SSR `/sitemap.xml`, `/robots.txt`) | Deleted starter pages `posts/index`, `posts/[slug]`, `[slug]`, `category/[slug]`, `tag/[slug]` (PORT-2/3 replace them); `404.astro` prerendered on Global layout; added prerendered `robots.txt.ts` (prod: allow + Sitemap; else disallow-all) and stub `sitemap.xml.ts` (TODO PORT-7); added `scripts/check-static-routes.mjs` wired into `build` (negative test: exit 1 on an un-prerendered page) |
| 2 | Top-level wrangler lacks SESSION KV / placeholder Hyperdrive id | Yes (placeholders are intentional until CUT-1) | Added top-level `kv_namespaces` SESSION with placeholder id + TODO; documented in `runbooks/deploy-production.md` |
| 3 | `env.testing` lacks `exports`/DO migration | **No (rejected)**: `exports` is inheritable; built `dist/server/wrangler.json` for `CLOUDFLARE_ENV=testing` contains `exports.EmDashRoom` (sqlite), and `wrangler deploy --dry-run` lists `env.EMDASH_ROOMS (EmDashRoom)` | None. Note added to deploy-production.md |
| 4 | `deploy`/`build` scripts: legacy wrangler hijack, post-build skipped | Yes | `build` = guard + `astro build` + `post-build.mjs`; `deploy` = `pnpm build && wrangler deploy -c dist/server/wrangler.json`; `post-build` made idempotent (root `deploy:testing:*` still work). `preview` left as `astro preview` (does not use the root wrangler config) |
| 5 | Middleware fails open if `SITE_ENV` unset; setup gate runs after EmDash middleware | Partly true, **not in FIX-1 scope** | Not changed. `SITE_ENV` is always set via `vars`. Suggest a separate story (fail closed in `middleware.ts`) |
| 6 | Version/workspace drift (caret ranges, root `workspaces` omits `apps/*`) | Yes | Not in FIX-1 scope; for Lead. (pnpm uses `pnpm-workspace.yaml`, which includes `apps/*`) |
| 7 | `worker-configuration.d.ts` stale (MEDIA/DB) | Yes | Regenerated with `wrangler types -c wrangler.jsonc` (added `assets.binding: "ASSETS"`, `types` script); Env = SESSION, HYPERDRIVE, ASSETS, SITE_ENV, EMDASH_ROOMS. Added `@types/node` devDependency (tsconfig `types: ["node"]` had no package) |
| 8 | Starter pages use `Base` not `Global`; no 404.html | Yes | Covered by #1 (deleted / ported 404) |
| 9 | Missing favicon.svg / manifest icons | Not checked, out of scope | For PORT-1 follow-up |
| 10 | `pv.ts` promise never reset on failure | Not checked, out of scope | For Lead |
| tsconfig | Root `tsconfig.json` typechecks apps/web | Yes (before: 14 errors from `apps/web/**` plus 1 unrelated in `packages/particle-hero`, 15 total; after: 0 errors) | `exclude` += `apps`, `.claude` |
| media | Built-in `local` provider active | Yes (`emdash/dist/virtual-modules`: added unless a `local` descriptor has `enabled:false`) | `localMedia({ enabled: false })` from `emdash/media`. Verified on dev server: `/_emdash/api/media/providers` returns only `cloudinary` |

## Commands and results
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build`: pass (guard ok, `dist/client/404.html` exists, 404 uses Global layout). Also passes with `SITE_ENV=production` (robots allow + Sitemap) and `CLOUDFLARE_ENV=testing SITE_ENV=testing` (disallow-all, noindex `_headers`).
- `pnpm exec wrangler deploy --dry-run -c dist/server/wrangler.json` (testing build): bindings EMDASH_ROOMS, SESSION, HYPERDRIVE, ASSETS, SITE_ENV.
- apps/web: `pnpm exec vitest run` 19/19 pass; `pnpm exec astro check` 0 errors.
- root: `pnpm exec astro check` 0 errors; `pnpm test:unit` 209 pass, 3 skipped.

## Notes / leftovers
- `src/pages/index.astro` still links to `/posts/<id>`, now a 404 until PORT-2/3.
- `/spike/**` pages are prerendered and would ship to production; remove before cutover.
- `/.well-known/oauth-*` (EmDash SSR) are unreachable under the current asset routing; see deploy-production.md.
- A production build needs `SITE_ENV=production`; post-build fails closed to noindex otherwise.
- `pnpm install` was needed in this worktree; `pnpm-lock.yaml` changed only for `@types/node`.
