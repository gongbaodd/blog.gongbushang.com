# ADMIN-dashboards (GON-201): external SaaS dashboards in the EmDash admin

Branch `emdash/ADMIN-dashboards`, cut from `feat/emdash` (06113427).

## Approach

EmDash has no declarative "admin links" built-in, so this uses the plugin admin API with Block Kit (no custom React, nothing added to the browser bundle):

- `definePlugin({ id: "service-dashboards", admin: { pages, widgets }, routes: { admin } })`, registered natively like `rebuild-on-publish` via a `PluginDescriptor` with `adminPages` and `adminWidgets`.
- Sidebar page `/_emdash/admin/plugins/service-dashboards/dashboards` ("Service dashboards") and a full-width dashboard widget. Both are served by the `admin` route: `page_load` with `page: "widget:<id>"` returns the compact widget, anything else returns the page.
- Each link is a Block Kit `link` element with `target: { kind: "external", url }`. Per the EmDash docs the host opens external links in a new tab with `noopener noreferrer`.
- Route permission is the default (`plugins:manage`, admins only).

Files (all new except the 2-line registration in `apps/admin/astro.config.mjs`):

- `apps/admin/src/dashboards/links.ts`: the only file to edit to add, change or remove links. Grouped into 4 categories: Infrastructure & Hosting, Media & Content, Analytics/Traffic/Monetization, Project Management.
- `apps/admin/src/dashboards/blocks.ts`: data to Block Kit (page and widget).
- `apps/admin/src/dashboards/plugin.ts`: plugin, descriptor and the pure `renderAdminRoute`.
- `apps/admin/src/dashboards/dashboards.test.ts`: 12 tests.

## Ticket corrections applied

- `growgen-colorize` omitted; no testing links (a test asserts neither appears).
- PV Worker: `https://pv.growgen.xyz/pv` still answered 200 with live data, so it is mentioned in the Cloudflare "Workers & Pages" note (source is no longer in the repo). It has no dashboard of its own, so it has no separate link.
- Altare omitted: the runbook only says it is optional and nothing confirms a deployment. Add it to `links.ts` when it exists.
- Account/project IDs: `SUPABASE_PRODUCTION_REF` and `CLOUDFLARE_ACCOUNT_ID` are read from `process.env` inside the server-side route at request time. They are validated by format (20 `[a-z0-9]`, 32 hex) and fall back to generic dashboard URLs (`https://supabase.com/dashboard/projects`, `https://dash.cloudflare.com/`) when unset or malformed. A test asserts no 32-hex string or the old project ref appears in the source. GoatCounter, Linear, GitHub URLs are literal.

## Checks (run in this worktree)

- `pnpm --filter admin test` (run as `pnpm test` in `apps/admin`): 3 files, 46 tests pass (34 existing + 12 new). New tests cover categories, https only, no duplicates, no testing/colorize, `_blank` / `noopener noreferrer` constants, only `external` https link targets in page and widget output, env fallback, and that other env values (DATABASE_URL, tokens, keys) never appear in rendered output.
- `pnpm --filter admin typecheck` (astro check): 0 errors, 0 warnings.
- `pnpm --filter admin build`: succeeds; `service-dashboards` is present in the built server middleware.
- `pnpm --filter admin smoke` against local Supabase 127.0.0.1:54322: 36 ok, 0 FAIL.
- Booted the built admin (`scripts/start.mjs`, SITE_ENV=local) on 127.0.0.1:4399: `/healthz` 200; `POST /_emdash/api/plugins/service-dashboards/admin` returns 401 unauthenticated while an unknown plugin returns 404, so the route is registered; `/_emdash/admin/plugins/service-dashboards/dashboards` redirects (302) to login.
- Root `astro check`: 43 errors, all `Cannot find module` / implicit-any in `packages/utils` and `packages/shadcn` (e.g. `remark`, `strip-markdown`, `tailwind-merge`). Cause: this worktree only had `pnpm install --frozen-lockfile --filter admin...`, so legacy-root deps are absent. No errors in `apps/admin`. Per the worktree-lockfile note, re-run in the main checkout after merge.

## Not done / open

- Authenticated rendering in a browser was not verified: it needs an admin passkey session, which could not be minted without setup against the local DB. The handler output is covered by unit tests and the host registration by the 401/404 comparison above. Eyeball the page once after merge.
- `CLOUDFLARE_ACCOUNT_ID` is not in `apps/admin/.env.example` or `docker-compose.yml` (outside my lane, and GON-198 is editing the admin infra). The runtime falls back to the generic Cloudflare URL until it is passed to the container. `SUPABASE_PRODUCTION_REF` is already passed.
- `@emdash-cms/blocks` is not a direct dependency of `apps/admin`, so `blocks.ts` uses a small structural type; the host validates the real shape at runtime.
