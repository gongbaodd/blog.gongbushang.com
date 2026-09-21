# growgen.xyz Website Optimization Plan

> Created: 2026-09-21
> **Status: IMPLEMENTED 2026-09-21** — see §8 for results.
> Scope: https://growgen.xyz (Astro 6 + React 19 + Mantine 9, static output on Vercel)
> Method: Live-site measurement (curl + HTML analysis + dist bundle audit) cross-checked against the `modern-web-guidance` skill guides (`performance`, `optimize-image-priority`, `optimize-script-priority`, `optimize-preload-priority`, `defer-rendering-heavy-content`).

---

## 1. Current state (measured)

### 1.1 Homepage HTML is 1.37 MB

`curl https://growgen.xyz` → **1,368,103 bytes** of uncompressed HTML. A static blog homepage should be well under 150 KB. Breakdown of where the bytes go:

| # | Content | Size | Source in repo |
|---|---------|------|----------------|
| 1 | `ParticleHero` island `props` attribute (every post + podcast with title, date, category, `umap2D` coords, serialized in Astro's resumable format) | **~485 KB** | `src/pages/index.astro:41` → `packages/particle-hero/ParticleHero.astro` |
| 2 | Inline `style` containing the gallery `traceSvg` data-URI (`background-image:url("data:image/svg+xml,...")`, 216 KB single attribute) | **~217 KB** | `packages/particle-hero/ParticleHero.tsx:80-83, 139-148` (`traceSvgToCssBackground`) |
| 3 | Server-rendered Mantine Heatmap SVG (368 `<rect>` cells, GitHub-style year calendar) | **~47 KB** | `packages/heat/MantineHeatWrapper.astro` (client island on homepage) |
| 4 | Repeated Mantine CSS-variable `style` attributes on badges/chips/buttons | **~150 KB** | SSR output of Mantine components |
| 5 | Same Mantine `@media (max-width: 35.99em) .mantine-visible-from-xs {...}` block inlined **31 times** | **~25 KB** | Mantine CSS-module SSR dedup gap |

Everything else (~445 KB) is the page skeleton, meta, and the remaining islands.

### 1.2 Hydration is all-or-nothing

The homepage has **13 `astro-island` components, all effectively eager** — `MantineMain` wraps the whole page with `client:load` (src/pages/index.astro:40). `WorldMap` (maplibre), `SpotifyPlayer`, `Search`, `ViewCount`, `MantineHeat` all hydrate immediately even though they sit below the fold.

### 1.3 JS bundles are inflated by a build flag

Largest bundles in `dist/_astro`:

| Bundle | Size | Note |
|--------|------|------|
| `MantineHero.*.js` | 3.7 MB | hero-page chunk |
| `tabler-icons-react.*.js` | **2.2 MB** | icon library shipped near-wholesale |
| `maplibre-gl.*.js` | 1.1 MB | WorldMap |
| `three.module.*.js` | 668 KB | ParticleHero |
| `CustomMantineProvider.*.js` | 484 KB | shared Mantine runtime |
| `lucide-react.*.js` | **468 KB** | second icon library, also un-shaken |
| `cytoscape.esm.*.js` | 432 KB | |
| `katex.*.js` | 256 KB | |

Key cause: `astro.config.mjs` sets `vite.build.rollupOptions.treeshake: false` — this disables tree-shaking **globally**, which is why two icon libraries ship their entire icon sets. (Added around the Astro upgrade commit `eaecfe1`; the AGENTS.md notes Rapier/WASM workarounds — **verify whether it is still needed**.)

### 1.4 Render-blocking CSS on every route

`packages/components/BaseHead.astro` imports globally on all pages:

- `katex/dist/katex.min.css` (only needed on posts with math)
- `@mantine/charts/styles.css`, `@mantine/carousel/styles.css`, `@mantine/spotlight/styles.css` (only some pages use these)

All of it is render-blocking `<link rel="stylesheet">` CSS on every page including the homepage.

### 1.5 What is already fine

- GoatCounter analytics is `async` and tiny.
- No `<img>` on the homepage → no image-priority issues there; post pages already run images through Cloudinary (`rehypeCloudinary`).
- No `@import` chains found in compiled CSS.
- RSS + sitemap integrations are present.

---

## 2. Goals

| Metric | Today (est.) | Target |
|--------|--------------|--------|
| Homepage HTML (uncompressed) | 1.37 MB | **< 150 KB** |
| Render-blocking CSS on homepage | katex + 3 Mantine stylesheets | **1 global sheet** |
| Islands hydrating on `load` | 13 | **≤ 3** (header, hero) |
| Largest JS on homepage path | 2.2 MB icon bundle in graph | **< 600 KB total** |
| LCP (mobile, 4G) | heavy parse + 216 KB inline SVG paint | **< 2.0 s** |
| INP | unmeasured; verify hover/heat interactions | **< 200 ms** |
| CLS | verify after `content-visibility` additions | **< 0.05** |

---

## 3. Action plan

### Phase 0 — Baseline (before touching code)

- [ ] Run Lighthouse (mobile, "Slow 4G") + WebPageTest on `/`, one post page, `/lab`, `/world`, `/year`. Save reports as `docs/plan/baseline/*.json`.
- [ ] Record CrUX field data (the site has `/tag/crux`, so check PSI for real-user LCP/INP/CLS).
- [ ] Note homepage transfer size & waterfall (screenshot into `docs/plan/baseline/`).

### Phase 1 — HTML payload (P0, biggest wins)

**1.1 Stop serializing all posts into the `ParticleHero` island props (~485 KB)**
- Move the posts+UMAP dataset out of island props into a static JSON asset, e.g. `public/data/umap-posts.json` (emitted at build from `packages/metadata-embedding`), and `fetch()` it inside `ParticleHero` after hydration (it's already `async` — `loadScene` awaits).
- Keep only a minimal SSR seed (e.g. `{ postsCount, years }`) in props.
- Files: `src/pages/index.astro`, `packages/particle-hero/ParticleHero.astro`, `packages/particle-hero/postsData.ts`.
- Expected: −480 KB HTML; hero becomes interactive sooner (less HTML parse + island hydrate payload).

**1.2 Stop inlining `traceSvg` as a 216 KB data-URI style attribute**
- The placeholder is only shown while WebGL loads **or when WebGL fails** — a rare path. Reference the SVG by URL instead of inlining: write/copy the trace to `src/content/generated/gallery/{id}.svg` (it already exists there per `readGalleryTraceSvg`) and expose it as a served path, then `background-image: url(/generated/gallery/{id}.svg)`.
- Better still: keep the plain `bgColor` as SSR placeholder (bytes ≈ 40) and lazy-load the traced SVG only when `webglFailed` is true.
- File: `packages/particle-hero/ParticleHero.tsx` (`placeholderStyle`, `traceSvgToCssBackground`), `packages/utils/gallery.ts`.
- Expected: −216 KB HTML; faster first paint (the browser currently parses a 216 KB URL-encoded SVG before paint).

**1.3 Lazy-render the heatmap (−47 KB HTML, −JS on main thread)**
- The GitHub-style heatmap is far below the fold. Render it `client:visible` and/or render the SVG grid client-side after IntersectionObserver fires, keeping a fixed-height skeleton (with `contain-intrinsic-size`) to avoid CLS.
- File: `packages/heat/MantineHeatWrapper.astro` (`client:load` → `client:visible`), `src/pages/index.astro`, `src/pages/cv.astro` (keep eager on `/cv` if it's above the fold there).

**1.4 Defer below-fold islands**
- `WorldMap`/`GLMap`, `SpotifyPlayer`, `Search`, `ViewCount`, `Tags` → `client:visible` / `client:idle` (maplibre is 1.1 MB — hydrating it at load is pure waste).
- Keep `MantineHeader`/`HeaderNanoStore` eager.
- Files: `src/pages/index.astro`, `src/components/WorldMap.astro`, `src/components/SpotifyPlayer.tsx` wrapper.

**1.5 Deduplicate Mantine repeated CSS**
- The identical `@media .mantine-visible-from-xs` block appears 31× and badge/chip CSS vars are re-emitted per element (~175 KB combined). Audit the Mantine components that inject per-instance `<style>` (`@mantine/core` CSS modules via SSR); upgrade Mantine if a newer patch fixes SSR dedup, or replace per-item inline `style` vars with a shared CSS module class on the repeated badge/chip elements (post cards, tag lists).
- Files: card/tag rendering components under `packages/card/`, `packages/tags/`.
- Expected: −150…175 KB HTML.

### Phase 2 — JS & CSS delivery

**2.1 Re-enable tree-shaking (−2.6 MB of icons)**
- Remove `vite.build.rollupOptions.treeshake: false` from `astro.config.mjs` and rebuild. If the original WASM/Rapier build failure returns, re-scope the workaround (pnpm override / `optimizeDeps.exclude` already handles Rapier) instead of disabling tree-shaking globally.
- Verify both `tabler-icons-react` (2.2 MB) and `lucide-react` (468 KB) shrink to the few icons actually imported; long-term, consolidate on one icon library.
- Acceptance: `dist/_astro` largest chunk < 700 KB; homepage JS total < 600 KB compressed.

**2.2 Split `MantineMain`'s client footprint**
- `CustomMantineProvider.*.js` (484 KB) loads on every hydrated page. Confirm all Mantine islands actually need the full provider; consider `client:idle` for `MantineMain` if the SSR HTML is interactive enough on first paint, and lazy-load `MantineHero`'s 3.7 MB chunk (it must not be reachable from the homepage graph).

**2.3 Move page-specific CSS out of `BaseHead`**
- Keep only `globals.css` + `@mantine/core/styles.css` + view-transition CSS global.
- Import `katex` CSS only in the post-layout (or use Astro's `experimental.styleDedupe` / conditional import where math is detected), and the `charts/carousel/spotlight` styles in the components that use them (Mantine supports CSS-side importing per component).
- File: `packages/components/BaseHead.astro`.
- Expected: remove ~2 render-blocking stylesheets on most routes.

**2.4 Resource hints**
- `preconnect` to `res.cloudinary.com` (post images) and `gc.zgo.at` only on pages that use them; add `fetchpriority="low"` to the GoatCounter script (it's `async` already — per `optimize-script-priority`, deprioritize non-essential scripts).
- No preload changes needed until re-measurement identifies a real LCP resource (homepage LCP is text after Phase 1).

### Phase 3 — Rendering & interaction polish

**3.1 `content-visibility: auto` on below-fold homepage sections**
- Apply to `BlogSections`, `WorldMap`, `Tags`, footer sections — each with `contain-intrinsic-size: auto <estimated-height>` (mandatory, to avoid scrollbar jump).
- Do **not** apply to the hero (above the fold) per the guide.
- Files: CSS modules of `src/components/BlogSections.astro`, `WorldMap.astro`, `packages/tags/Tags`.

**3.2 Long-task audit for INP**
- `ParticleHero` runs a `requestAnimationFrame` loop + resize listeners + a `ResizeObserver` (ParticleHero.tsx:263-280) — already debounced hover (300 ms). Verify heatmap hover and search (`⌘K` spotlight) don't create >50 ms tasks; if they do, slice with `scheduler.yield()` (fallback `setTimeout 0`).
- Ensure the WebGL loop pauses when the canvas scrolls out of view (IntersectionObserver → cancel rAF) — saves battery and main thread on long scrolling sessions.

**3.3 Fonts**
- `@font-face` currently appears only in `packages/resume/MantineResume.module.css`; verify no other web fonts load on `/` and that no `@import` chains exist. If a hero font is added later, preload it with `<link rel="preload" as="font" type="font/woff2" crossorigin>` (max 2 fonts, per `optimize-preload-priority`).

### Phase 4 — Caching & navigation

- [ ] Confirm Vercel serves `dist/_astro/*` with `Cache-Control: public, max-age=31536000, immutable` (Astro hashes filenames; Vercel does this by default — verify header, no config change expected).
- [ ] Enable Astro prefetch (`prefetch: { prefetchAll: true, defaultStrategy: 'hover' }` in `astro.config.mjs`) so tag/series navigation feels instant — HTML `NetworkFirst`-style prefetching, no service worker needed.
- [ ] Optional: `Speculation Rules` / `prerender` for the most-visited next pages if prefetch feels insufficient.

---

## 4. Execution order & effort

| Phase | Items | Effort | Risk | Expected HTML saving |
|-------|-------|--------|------|---------------------|
| 0 | Baseline reports | 0.5 h | none | — |
| 1 | 1.1–1.5 | 1–2 days | low-med (data-fetch change in hero) | **~900 KB lighter** |
| 2 | 2.1–2.4 | 1 day | med (treeshake flag; CSS splits) | n/a (JS/CSS) |
| 3 | 3.1–3.3 | 0.5–1 day | low | render-time win |
| 4 | caching/prefetch | 0.5 h | low | navigation win |

Re-measure Lighthouse/CrUX after **each phase** and append results to this file.

## 5. Acceptance checklist

- [ ] Homepage HTML < 150 KB uncompressed; no single attribute/style > 10 KB.
- [ ] `tabler-icons-react` / `lucide-react` chunks gone or < 50 KB.
- [ ] ≤ 3 islands with `client:load` on `/`; maplibre never loads on `/` until scrolled to.
- [ ] Lighthouse mobile perf ≥ 90 on `/` and a sample post; LCP < 2.0 s, INP < 200 ms, CLS < 0.05.
- [ ] No regression in WebGL fallback path (placeholder still shows when WebGL unavailable) — test `hero-gallery.astro` + forced-failure mode.
- [ ] `pnpm build` green; existing Vitest suites (`Umap.test.tsx` etc.) pass — update tests that assert on serialized props.

## 6. Browser support policy (suggested)

All proposed features are safe today:
- `fetchpriority` — Baseline since 2024-10-29 (progressive enhancement, ignored if unsupported).
- `content-visibility` + `contain-intrinsic-size` — Baseline widely available.
- `scheduler.yield()` — Chrome-only; always shipped with the `setTimeout` fallback shown in the guide.

Suggested policy to record in AGENTS.md:
> **Browser Support:** Allow Baseline Newly Available features with progressive enhancement; only adopt custom fallback code ≤ 20 lines with no external dependencies.

## 7. Explicitly out of scope (for now)

- Migrating off Mantine/React-Bits heavy components (design decision, not performance).
- Service Worker/offline shell (a static site on Vercel's CDN gains little).
- Image pipeline changes (Cloudinary already handles post imagery).

## 8. Implementation results (2026-09-21)

### What changed

| Plan item | Implementation | Files |
|-----------|----------------|-------|
| 1.1 Runtime posts fetch | Island no longer receives posts as props; `ParticleHero` fetches `/api/posts/umap.json` (prerendered static JSON, 284 KB) after hydration. `usePostFilter` now follows the latest year until the user picks one (async-safe). | `ParticleHero.astro`, `ParticleHero.tsx` (`useUmapPosts`), `usePostFilter.ts` |
| 1.2 Trace SVG by URL | New prerendered endpoint `src/pages/api/gallery/trace/[file].svg.ts` (44 SVGs). Placeholder `style` is now ~150 bytes referencing the URL; `gallery.ts` gained `readGalleryTraceUrl()` / `listGalleryTraceFiles()`. | `src/pages/api/gallery/trace/[file].svg.ts`, `packages/utils/gallery.ts`, `index.astro`, `hero-gallery.astro` |
| 1.3 Heatmap deferred | `MantineHeatWrapper` `client:load` → `client:visible` (SSR SVG stays for SEO). | `packages/heat/MantineHeatWrapper.astro` |
| 1.4 Below-fold islands deferred | `SpotifyPlayer`, `ViewCount`, `LatestCarousel`, `HistoryCarousel` → `client:visible`; `GLMap` was already `client:idle`. | `index.astro`, `Footer.astro`, `BlogSections.astro` |
| 1.5 Tag cloud de-Mantined | The 460-badge Mantine `Tags` island (~142 KB HTML + hydration) replaced by a static `Tags.astro` component (plain anchors styled like Mantine light badges, tiny toggle script with `astro:page-load` re-init). `Tags.tsx`/`TagsWrapper.astro` removed. | `packages/tags/Tags.astro` (+`.module.css`) |
| Bonus: style dedup | New `dedupe-inline-styles` Astro integration (`astro:build:done`) removes exact duplicate `<style>` blocks — **42,589 removed across 1,617 pages** (cascade-safe: identical content, first occurrence wins). | `astro.config.mjs` |
| 2.1 Tree-shaking | Removed global `treeshake: false`. Rapier WASM verified intact (`raweventqueue_new` still present in the hero chunk — the original reason for the flag no longer reproduces with default tree-shaking). | `astro.config.mjs` |
| 2.3 Page-specific CSS | `katex.min.css` moved from `BaseHead` to `BlogPost.astro` (bundled per post page, e.g. `_slug_.css`); `@mantine/charts/styles.css` moved into `Folders.tsx` + `Umap.tsx`. Carousel/spotlight stay global (used by the header on every page). | `BaseHead.astro`, `BlogPost.astro`, `Folders.tsx`, `Umap.tsx` |
| 2.4 Resource hints | `<link rel="preconnect" href="https://res.cloudinary.com">` on post pages; `fetchpriority="low"` on the GoatCounter script. | `BlogPost.astro`, `Footer.astro` |
| 3.1 content-visibility | `content-visibility: auto` + `contain-intrinsic-size` on below-fold sections (blog carousels 600px, world map 700px, tag cloud 420px). Hero untouched. | `BlogSections.astro`, `WorldMap.astro`, `Tags.module.css` |
| 3.2 rAF pause | `ParticleHero` render loop pauses via `IntersectionObserver` when the hero scrolls out of view; delta flushed on resume to avoid particle jumps. | `ParticleHero.tsx` |
| 4 Prefetch | `prefetch: { prefetchAll: true, defaultStrategy: "hover" }`. | `astro.config.mjs` |

### Measured results

| Metric | Before | After |
|--------|--------|-------|
| Homepage HTML (uncompressed) | 1,368,103 B | **221,452 B (−84 %)** |
| `ParticleHero` island props | 639,546 B | **365 B** |
| Largest single HTML attribute | 216 KB (data-URI SVG) | ~3.8 KB |
| Inline `<style>` blocks on `/` | 81 (44.8 KB) | 49 (21.7 KB) |
| Mantine badges in HTML | 460 (~142 KB) | 0 (460 static anchors) |
| `tabler-icons-react` chunk | 2.2 MB | **eliminated** |
| `lucide-react` chunk | 468 KB | **eliminated** |
| Render-blocking katex CSS on `/` | yes | no (posts only) |
| Islands hydrating at load on `/` | 13 | 6 (header, search, hero, app shell, skeletons, transitions) |
| Trace SVGs served | inlined in HTML | 44 prerendered endpoints, fetched on demand |

### Verification

- `astro build` green (1,617 pages); `tsc --noEmit` clean.
- All homepage-referenced island/renderer scripts resolve 200 on a static serve of `dist/`; `/api/posts/umap.json` returns the expected shape; trace endpoint serves `image/svg+xml`.
- Rapier WASM init symbols present in the built hero bundle (WebGL physics page unaffected).
- Vitest: 170 passed / 19 failed — **all 19 pre-existing** (`window.matchMedia` missing in the test DOM for card/carousel/content components; confirmed identical failures on a clean tree via `git stash`).

### Still open (follow-ups)

- [ ] Phase 0 baseline Lighthouse/CrUX capture + post-deploy re-measurement (needs a deployed URL; local numbers above are transfer-size based).
- [ ] Mantine per-island `<style>` emission: the dedupe integration mitigates it, but an upstream fix (or fewer islands) would avoid the bytes entirely.
- [ ] Heatmap SSR SVG (47 KB) could be rendered client-side if the HTML budget needs to go lower — kept for SEO/CLS reasons.
- [ ] `MantineHero` page chunk (2.5 MB, three.js + Rapier) only affects `/hero`; lazy-load or split if that page becomes user-facing.
- [ ] Consolidate on a single icon library (tabler vs lucide) — both are now tree-shaken, so this is hygiene rather than performance.
