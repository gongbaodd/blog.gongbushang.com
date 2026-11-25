# PORT-9 (GON-177): assessment regressions and apps/web test tooling

Branch `emdash/PORT-9` (from `feat/emdash`). Commits: `7f5942d` (fixes and tooling), `ba91084` (oxfmt config), `f49172b` (formatting only).

## Fixes

1. **Duplicate post title.** Cause: `BlogPost.astro` hydrated `GridWithMenu` and `BlogContent` with `client:load`, so Astro wrapped the markdown in `<astro-slot>` and the legacy rule `.content > h1 { display: none }` no longer matched. Legacy renders both as plain SSR inside the `MantineMain` island. Removed both directives. Measured on `/fe/2025/09/08/mermaid/`: the `.prose h1` elements are one visible plus one hidden, same as the legacy build (before: both visible).
2. **Sidebar cover card.** `BlogMenu` now renders the real `PostCard` (`hideExcerpt fill`), fed the same client post the listings and `/api/cards` use (`getPostEntries` + `toClient`, passed as `clientPost`). The simplified card from PORT-2 is gone. The series-navigation card PORT-2 added is unchanged (it does not exist in legacy; left as is).
3. **Analytics opt-out: a real privacy bug, not a harness artifact.** Reproduced only against the Worker preview (`astro preview`), where the page is slower; fast static serving hid it. Mechanism: Mixpanel persists its own opt-in flag, and `opt_out_tracking_by_default` is applied only when the flag is not already set (`OptOutFlagDecisions.init` in mixpanel-browser). When the visitor clicks "No thanks" and navigates before the lazily loaded Mixpanel module has run the queued `opt_out_tracking`, the old flag from an earlier "Allow" survives. Next page: our stored consent says `denied`, Mixpanel's says opted in, and it sent `$mp_web_page_view` + 4 `post_read` (10 events vs the baseline 5). The code in `apps/web/src/analytics/index.ts` was identical to legacy `packages/analytics`, so **legacy has the same race** (not touched; CUT-2 deletes it). Fix: on every init, make Mixpanel's flag follow our stored choice (`granted` -> opt in if needed; anything else + leftover opt-in -> `opt_out_tracking({ delete_user: false })`), and fire the page view by hand after that (`track_pageview: false` at init) for a returning opted-in visitor only, which is what `track_pageview: true` did before. Three new unit tests cover it. Verified: `@analytics-on` 2/2 against both the static server and `astro preview` (the latter failed before the fix).
4. **Tooling** (apps/web `package.json`): `test` (vitest), `test:e2e`, `test:e2e:analytics-on`, `check:hydration`, `fmt`, `fmt:check`.
   - `scripts/e2e.mjs`: builds apps/web with `SITE_ENV=production` (analytics only runs on a production build), empty or fake `PUBLIC_MIXPANEL_TOKEN`, `SKIP_PDFS=1` unless `E2E_PDFS=1`, local Hyperdrive default; serves `dist/client` with a small static server on a free port (`E2E_PORT` to pin); runs the root cucumber suite with `E2E_BASE_URL`. Flags: `--analytics-on`, `--hydration`, `--skip-build`, `--tags`.
   - `tests/hydration-routes.txt`: 26 routes covering every route group (posts, category, year, tag(s), series, world, podcast list and episode, about, lab, cv, resume, hero-gallery, umap, contact, privacy, sitemap, 404). `scripts/hydration-check.mjs` reads it via `HYD_ROUTES_FILE`.
   - `e2e/support/hooks.ts` and `scripts/hydration-check.mjs`: `E2E_CHROME_CHANNEL=chrome` uses the system Chrome (no browser install).
   - `e2e/features/static-routes.feature`: About now expects "About this site" (legacy `/about` has the same heading; the new page matches it).
   - `apps/web/.oxfmtrc.json`: root has no oxfmt config (defaults), so the apps/web config only adds ignore patterns; `f49172b` formats `apps/web/src` (68 files, formatting only).

## Verification (all from the worktree)

| Check | Result |
|---|---|
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` (with PDFs) | ok |
| `pnpm --filter web test` | 22 files, 164 tests pass |
| `pnpm --filter web typecheck` (astro check) | 0 errors |
| `pnpm exec astro check` (root) | 0 errors |
| `E2E_CHROME_CHANNEL=chrome pnpm --filter web test:e2e` | 14/14 scenarios, 90 steps |
| `E2E_CHROME_CHANNEL=chrome pnpm --filter web test:e2e:analytics-on` | 2/2 scenarios, 28 steps |
| `E2E_CHROME_CHANNEL=chrome pnpm --filter web check:hydration` | 26/26 routes ok |
| `pnpm --filter web fmt:check` | clean |

Notes:
- `lockfile` unchanged (`pnpm install --frozen-lockfile` ok); no new dependencies.
- `route-parity` in vitest needs the 18 resume PDFs in `dist/client`, so run it after a full build (the e2e script skips PDFs by default and leaves a dist without them).
- `E2E_CHROME_CHANNEL=chrome` is needed on this machine because Playwright's bundled browsers are missing.
- Servers started during the work are stopped.

## Screenshots (post page `/fe/2025/09/08/mermaid/`, 1440 wide)

- Before (feat/emdash build): `docs/plan/emdash/reports/PORT-9/post-before.png`
- After: `docs/plan/emdash/reports/PORT-9/post-after.png`
- Legacy build for reference: `docs/plan/emdash/reports/PORT-9/post-legacy.png`
