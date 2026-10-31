# Plan — Server-render post lists (Step 2) and fix hydration #418 (Step 3)

> Parent: `docs/plan/adsense-rejection-fix-plan.md`
> Status: **DONE** (branch `adsense-reject-fix`)
>
> Outcome:
> - **#418 root cause 1:** `dedupeInlineStyles` in `astro.config.mjs` deleted duplicate `<style>` blocks (Mantine's
>   `data-mantine-styles="classes"`) from the built HTML, so every island's server HTML lacked elements React rendered.
>   Removed the plugin; the Mantine helper classes are now emitted once in `BaseHead` (`packages/utils/mantine-classes.ts`)
>   and `CustomMantineProvider` uses `withGlobalClasses={false}`.
> - **Root cause 2:** `$pathname` was empty on the first client render (set only in an effect), so the active nav link differed.
>   `MantineHeader` now receives `pathname` and seeds the store before rendering.
> - **Step 2:** a visible server-rendered `PostIndexList` was tried and removed (not wanted). Only the build-time counts remain
>   ("View All N Posts", "N posts in 2026", "See N Destinations"). List pages still load cards client-side, so crawlers see no
>   post links there; revisit via passing initial posts to the islands if needed.
> - `pnpm check:hydration` (`scripts/hydration-check.mjs <baseUrl>`) checks `/`, `/all`, `/year/2025`, `/lab`, `/tag/react`.
>   For readable messages build with `NODE_ENV=development npx astro build` and serve `dist`.

## Why these two go together

Both touch the same React list islands. Step 2 makes the list HTML contain real posts; Step 3 makes
the first client render match that HTML. Doing Step 2 alone will trigger *more* hydration errors,
so do them in one branch, in this order: **3a diagnose → 2 → 3b fix → verify**.

## Can Claude use a browser? What to add

Claude cannot see a browser by itself. Options, best first:

1. **Playwright (already in `node_modules/.bin`)** — Claude can write and run a headless script that
   opens `pnpm preview`, collects `console` / `pageerror` events and dumps the served-vs-hydrated
   HTML. Needs only browsers installed once: `pnpm exec playwright install chromium`.
   This is the recommended path and is also reusable as a regression test
   (`docs/plan/playwright-cucumber-e2e-plan.md`).
2. **claude-in-chrome extension** — install the Claude in Chrome extension and connect it; Claude then
   drives your real Chrome (useful for WebGL/maplibre pages that headless Chromium renders badly).
3. **Paste the console output** — run `pnpm dev`, open `/`, copy the full hydration error (dev builds
   print the component stack and a diff, production builds only print "#418").

For #418 the dev-mode message is essential, so use `pnpm dev` (not the production build) for 3a.

## 3a — Diagnose #418

1. `pnpm exec playwright install chromium`.
2. Add `scripts/hydration-check.mjs`: start `astro dev`, open `/`, `/all`, `/tag/<big tag>`,
   `/year/2025`, print every `console.error` / `pageerror`, exit non-zero if any contains "Hydration"
   or "#418".
3. Bisect by islands: temporarily change `client:load` → `client:only="react"` per island on the
   homepage until the error disappears. Candidates (from `src/pages/index.astro`): `MantineMain`,
   `ParticleHero`, `MantineHeatWrapper`, `BlogSections`, `WorldMap`, `Header`.
4. Likely causes to grep for in the offending island: `new Date()` / `toLocaleString` without fixed
   locale and time zone, `Math.random()`, `window` / `localStorage` / `matchMedia` in render,
   nanostores atoms read before hydration, counts computed differently on server and client
   (the "View 0 posts" text suggests `useStore` data empty on the server).

## 2 — Server-render lists

Files: `packages/masonry/BlogPlock.tsx`, `PodcastPlock.tsx`, `packages/carousel/BlogCarousel.tsx`,
`src/components/BlogListPage.astro`, `BlogSections.astro`, `YearFolders.astro`, and pages under
`src/pages/{tag,series,year,world}`, `[filter].astro`, `lab.astro`, `all`.

1. In each `.astro` page/component, build the first **N = 12** posts at build time
   (title, date, excerpt, link) from `getAllPosts()` / the filter helpers.
2. Render them as plain `<ul><li><article><a href>` markup inside the page (not inside a client-only
   island) **or** pass the same slice to the island as an `initialPosts` prop so server and client
   output are identical.
3. "Load More" fetches from the existing `src/pages/api/*` endpoints for the rest (page ≥ 1).
4. Compute counts at build time and pass them as props: homepage "View {n} posts in {year}",
   "View All {n} Posts", "See {n} Destinations".
5. Do **not** add per-page random ordering or relative dates ("3 days ago") to the initial render.

## 3b — Fix and lock in

1. Fix each cause found in 3a; prefer deterministic initial output and move client-only values to
   `useEffect`. Use `client:only="react"` only for widgets with no SEO value (map, heatmap, player).
2. Keep `scripts/hydration-check.mjs` as `pnpm check:hydration` and run it in CI.

## Gates

- `node scripts/audit-thin-pages.mjs dist 300` — none of `/`, `/all`, `/lab`, `/year/*`, `/series/*`
  appear.
- `curl -s localhost:4321/ | grep -c '<article'` > 10 and the text "View 0" is gone.
- `pnpm check:hydration` exits 0 on all sampled routes; `pnpm test:unit` and `pnpm build` green.
