# PORT-7: Mixpanel + consent, AdSense, newsletter/follow, RSS and sitemap, env switch

Branch `emdash/PORT-7` (from `feat/emdash`). Features F9, F22-F24.

## What changed (all under `apps/web` unless noted)
- **One env switch.** `astro.config.mjs` bakes `PUBLIC_SITE_ENV` (`SITE_ENV ?? CLOUDFLARE_ENV ?? "testing"`, fails closed) via `vite.define`. `src/analytics/env.ts` exposes `isProductionBuild()` and `isAnalyticsConfigured()` (token AND production). Used by analytics, AdSense and `robots.txt`.
- **Analytics** (`src/analytics/`): copied from `packages/analytics` (index, events, outbound, read-depth, tests, `MixpanelHead`, `ConsentBanner`), import path `@/src/analytics` (apps/web's `@` is its own root). `isEnabled()` now also requires a production build. Opt-in consent, `growgen_analytics_consent`, no identify: unchanged.
- **Restored TODO PORT-7 tracking, same event names/props:** `post_read` (BlogPost script, data attributes already on the page), `tag_clicked` (tag cloud `location: "tag-cloud"`, list menu `location: "list-menu"`), `city_opened`, `podcast_listen_clicked`. `/privacy/` consent buttons wired (`getConsent/optIn/optOut`); inert unless token + production. `related_post_clicked` and `search_*` events are in `events.ts` and will be used by PORT-6's islands.
- **AdSense:** `AdSenseHead`/`AdSenseSlot` ported; both render only on a production build (or `astro dev`). Per-post `adsense` flag logic in `BlogPost.astro` is unchanged.
- **RSS** `/rss.xml`: `@astrojs/rss`, items from a build-time snapshot (`src/generated/rss-items.json`, written by `scripts/legacy-data.mjs` from the same legacy metadata as the search index); falls back to EmDash posts if the snapshot is missing. TODO DATA-1.
- **Sitemap:** `@astrojs/sitemap` works with the Cloudflare adapter (writes `sitemap-index.xml` + `sitemap-0.xml` to `dist/client`), same filter as legacy. FIX-1's `sitemap.xml.ts` is now a prerendered alias of the index (keeps EmDash from injecting its SSR route). `robots.txt` (production) points at `/sitemap-index.xml`.
- **Bug fixed on the way:** `robots.txt.ts` read `process.env.SITE_ENV`, which is empty inside the prerender workerd, so a production build still emitted disallow-all. It now reads `import.meta.env.PUBLIC_SITE_ENV`.
- Newsletter: the legacy `NewsLetter.tsx` is unused anywhere, not ported. Follow was ported in PORT-5 (`/contact/`).
- Deps: `mixpanel-browser`, `@astrojs/rss`, `@astrojs/sitemap` (same ranges as the root). Docs: `PORTING.md`, `TEMPLATE_DIFF.md`, `.dev.vars.example`, Gantt marked `active`.

## Verification (commands run in the worktree)
- `pnpm install --frozen-lockfile` after `git submodule update --init packages/shiki-plantuml`: ok.
- Build (production, token + ad flags): `LEGACY_GENERATED_DIR=<main>/src/content/generated SITE_ENV=production PUBLIC_MIXPANEL_TOKEN=e2e-test-token PUBLIC_ADSENSE_ENABLED=true PUBLIC_ADSENSE_CONSENT_READY=true PUBLIC_ADSENSE_SLOT_ID=1234567890 SKIP_PDFS=1 pnpm build` (in apps/web): ok, guard `check-static-routes` ok. Home has the consent banner; 996 pages carry the AdSense tag; `robots.txt` = Allow + `Sitemap: https://growgen.xyz/sitemap-index.xml`; `post_read` is in the BlogPost bundle.
- Build (same flags, no `SITE_ENV`, i.e. testing): ok; no consent banner, no mixpanel, 0 AdSense pages, robots = disallow-all, `_headers` has `X-Robots-Tag: noindex`.
- Diff vs legacy `dist` (main checkout, built 2026-11-24): `rss.xml` header and all 992 items **byte-identical** (same order); `sitemap-index.xml` identical; `sitemap-0.xml` 1193 vs 1192 URLs, only `/sitemap/` missing (PORT-6 treemap).
- `pnpm exec vitest run` (apps/web): 81/82 pass (analytics tests incl. a new non-production no-op test; route-parity `rss/sitemap` group added to DONE with `/sitemap/` in OWNED_LATER: 0 missing). The one failure is `resume` (18 PDFs) because I built with `SKIP_PDFS=1`; unrelated to this story.
- `pnpm exec astro check` in apps/web: 0 errors, 0 warnings. At the repo root: 0 errors, 0 warnings.
- `pnpm vitest run packages/analytics` at the root: 15/15 pass.

## Open / for others
- **CI/deploy:** analytics and ads need `SITE_ENV=production` (or `CLOUDFLARE_ENV=production`) set in the production build env, plus `PUBLIC_MIXPANEL_TOKEN`, `PUBLIC_ADSENSE_*` as build env (not Worker secrets). Builder-Infra: add to the production workflow. Values come from Vercel env vars (plan section on secrets).
- **PORT-9:** port `e2e/features/analytics.feature` (`@analytics-on` build needs `SITE_ENV=production PUBLIC_MIXPANEL_TOKEN=e2e-test-token PUBLIC_MIXPANEL_API_HOST=http://127.0.0.1:4321/__mp`). Not run here.
- **PORT-6:** `/sitemap/` treemap, search and related-post islands should call `track()` from `@/src/analytics` for `search_*` and `related_post_clicked`.
- No post currently has `adsense: true`, so the per-post slot path was not exercised in a built page (code unchanged from legacy).
- Dev servers: none started.
