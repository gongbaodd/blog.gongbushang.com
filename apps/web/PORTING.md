# PORTING

Duplicated legacy code (CUT-2 deletes the originals).

| New | Legacy original |
|---|---|
| `src/lib/cloudinary.ts` | `packages/utils/cloudinary.ts` (copied unchanged; only `rehypeCloudinary` is used so far) |

## PORT-1 (site shell) - copied, originals stay until CUT-2

Import style: `apps/web` maps `@/*` to the `apps/web` root (tsconfig `paths` + Vite alias in `astro.config.mjs`), so ported code writes `@/src/...`. Legacy `@/packages/<x>/...` paths were rewritten to the new `src/` location. The legacy and new aliases do not collide: they live in different projects.

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/components/BaseHead.astro` | `packages/components/BaseHead.astro` | canonical/OG/Twitter/description removed: `<EmDashHead>` in `layouts/Global.astro` emits them; Spotlight CSS import deferred to the search story |
| `src/components/HeaderLink.astro`, `view-transition.css` | `packages/components/` (same names) | unchanged |
| `src/components/MantineAnchor.tsx`, `TransitionFrom.astro`, `TransitionSkeletons.tsx`, `ViewCount.tsx`, `ViewCount.module.css` | `src/components/` (same names) | import paths only |
| `src/layouts/Global.astro` | `packages/layouts/Global.astro` | takes title/description/... props, renders BaseHead + EmDash head/body hooks |
| `src/layouts/BlogPost.astro` | `packages/layouts/BlogPost.astro` | skeleton only; PORT-2 wires data, MantineMain/GridWithMenu, `post_read` script |
| `src/header/{Header.astro,MantineHeader.tsx,MantineHeader.module.css}`, `src/header/store/*` | `packages/header/**` | `<Search>` slot left as TODO (search story) |
| `src/footer/{Footer.astro,MantineFooter.tsx,Footer.module.css}` | `packages/footer/**` | `fragments/opensource.mdx` inlined as HTML (no `@astrojs/mdx`) |
| `src/stores/{CustomMantineProvider.tsx,layout.ts,pv.ts,skeletons.ts}` | `src/stores/` (same names) | import paths only |
| `src/skeletons/*.tsx` | `src/skeletons/*.tsx` | unchanged |
| `src/icons/*.svg` | `src/icons/*.svg` | footer brand icons |
| `src/styles/globals.css` | `packages/shadcn/app/globals.css` | unchanged |
| `src/utils/mantine-classes.ts` | `packages/utils/mantine-classes.ts` | unchanged |
| `src/consts.ts` | `packages/consts/index.ts` | shell subset (routes, titles); `SITE_DESCRIPTION` inlined |
| `tailwind.config.mjs` | `tailwind.config.cjs` + `packages/shadcn/tailwind.config.js` | merged; content scoped to `apps/web/src` |
| `postcss.config.mjs` | root `postcss.config.mjs` | Tailwind v3 + autoprefixer, skipped for `node_modules` CSS (EmDash admin is Tailwind v4) |
| `public/{favicon.ico,favicon-16x16.png,favicon-32x32.png,apple-touch-icon.png,site.webmanifest,safari-pinned-tab.svg}` | `public/` (same names) | `favicon.svg` and `blog-placeholder-1.jpg` do not exist in legacy `public/` either |
| `src/analytics/{MixpanelHead,ConsentBanner}.astro`, `src/ads/{AdSenseHead,AdSenseSlot}.astro` | `packages/analytics/*`, `packages/ads/*` | ported (PORT-7). Analytics lives in `src/analytics/` (`index.ts`, `events.ts`, `outbound.ts`, `read-depth.ts`, tests) and **replaces the `@/packages/analytics` import with `@/src/analytics`**; new `env.ts` gates analytics + ads on a production build (`PUBLIC_SITE_ENV`). Duplicate of `packages/analytics`, `packages/ads` (CUT-2 deletes the originals) |

## PORT-2 (post page) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/pages/[category]/[year]/[month]/[day]/[slug].astro` | `src/pages/[category]/[year]/[month]/[day]/[slug].astro` | `getStaticPaths` from EmDash (`legacy_id` + category term); body rendered with `src/lib/markdown.ts` |
| `src/layouts/BlogPost.astro` | `packages/layouts/BlogPost.astro` | takes plain props (page does the data work); `post_read` script ported (PORT-7); related-posts island is TODO (PORT-6) |
| `src/components/BlogContent.tsx` (+ `.module.css`) | `packages/content/BlogContent.tsx` | Tabler icons -> lucide; dayjs date -> `legacy_date` string; `BlogMenu` uses a simplified cover card (no `PostCard`, PORT-3) and adds series prev/next; `RelatePosts` not ported (PORT-6) |
| `src/components/MantineMain.tsx`, `GridWithMenu.tsx` (+ css) | `packages/scaffold/*` | unchanged |
| `src/utils/reading-time.ts` | `packages/utils/readingTime.ts` | unchanged |
| `src/lib/content.ts` | `packages/utils/{extract,post}.ts` (title, excerpt, links) | EmDash entry mapping; title = first heading (legacy rule), excerpt via remark + strip-markdown |
| `src/lib/mdx-lite.ts` | `packages/image/DescriptionImage.tsx` | the 3 `.mdx` posts: `<DescriptionImage>` rewritten to plain HTML at render time |
| `public/profile.jpg` | `public/profile.jpg` | author avatar |

## PORT-3 (listing pages + JSON/NDJSON APIs) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/pages/{[filter],tags,year,world}.astro`, `tag/[filter]`, `series/[filter]`, `year/[filter]`, `world/[city]` | same names under `src/pages` | data from EmDash via `src/lib/listing.ts`; `[filter]` skips `podcast` (PORT-8 owns `/podcast/`); no `/sitemap/` (treemap, PORT-6) |
| `src/pages/api/**` (all legacy endpoints) | `src/pages/api/**` | same paths and JSON/NDJSON shapes; `gallery/trace/*.svg`, `posts/all.json`, `posts/umap.json` are static copies generated into `public/api/` |
| `src/lib/listing-core.ts`, `listing.ts`, `smartypants.ts`, `api.ts` | `packages/utils/{post,filter,badges,heatmap,cards,city}.ts` | `mapServerPostToClient` port; dates use the legacy build TZ (Europe/Tallinn) so `date` instants match |
| `src/consts-list.ts` | `packages/consts/{index,colors}.ts` | listing constants |
| `src/card/*`, `src/masonry/*`, `src/menu/BlogListMenu.tsx`, `src/folder/*`, `src/bits/Folder.tsx` | `packages/{card,masonry,menu,folder}`, `src/bits/Components/Folder` | tabler icons -> lucide; `track("tag_clicked", location "list-menu")` restored (PORT-7) |
| `src/stores/{links,podcast,yearCovers,heatmap}.ts` | `src/stores/*`, `packages/heat/store/heatmap.ts` | import paths only |
| `src/components/{BlogListPage,YearFolders,WorldMap}.astro` | `src/components/*` | `WorldMap` is a placeholder (TODO PORT-6); `/year/` search banner TODO (search story) |
| `scripts/derive/index.ts`, `src/lib/legacy-data.ts` | `src/content/generated/**` | Done (PORT-8, MIG-3): covers fallback, card color sets, UMAP ids, relates (embeddings), podcast episodes, gallery, map locations, tag/city order, all derived from EmDash + the `derived` cache; nothing reads `src/content` (the `legacy-data` name is historical). Output `src/generated/`, `public/api/` is git-ignored |

## PORT-8 (build-time derived data) - reuses legacy pipeline code by relative import, nothing copied

`scripts/derive/` replaces the post part of the former `scripts/legacy-data.mjs` (deleted). It imports, without copying, `packages/content-prepare` (`extractDataFields`, `geocodeCities`), `packages/metadata-embedding` (`embedFromText`, `computeUmapInputHash`, `runUmapBinary`), `packages/post-embedding` (`isEmbeddingServerRunning`, model) and `packages/image-metadata` (`getColorSet`). **CUT-2 must keep those packages** (they are no longer legacy-site-only). `scripts/derive/relates.ts` is the one ported copy (of `packages/utils/nearest.ts`). Podcast and gallery data are still read from the content submodule (MIG-3). Runbook: `docs/plan/emdash/runbooks/data.md`.

## PORT-4 (home) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/pages/index.astro` | `src/pages/index.astro` | starter home removed; data from `src/lib/listing.ts` (`getBadges`, `homeGalleryImage`, `cityPages`) |
| `src/particle-hero/**` | `packages/particle-hero/**` | three.js + GLSL shaders unchanged; `loadUmapPosts.ts` dropped (island fetches `/api/posts/umap.json`); `ParticleHero.astro` renders `src/hero/fragments/*.md` with `renderMarkdown` instead of MDX |
| `src/hero/fragments/{title,description}.md` | `packages/hero/fragments/*.mdx` | `.mdx` -> `.md` (no MDX runtime) |
| `src/carousel/*` | `packages/carousel/*` | `IconX` -> lucide `X`; `BlogCarousel.test.tsx` not ported (needs jsdom + jest-dom, not set up in apps/web) |
| `src/heat/*` | `packages/heat/*` | unchanged (store + wrapper use `listing.getCounts`) |
| `src/map/*`, `src/components/WorldMap.astro` | `packages/map/*`, `src/components/WorldMap.astro` | real maplibre `GLMap` replaces the PORT-3 placeholder (also used by `/world/`); `track("city_opened")` restored (PORT-7) |
| `src/tags/*` | `packages/tags/*` | `track("tag_clicked", location "tag-cloud")` restored (PORT-7) |
| `src/components/{BlogSections.astro,GridHalf.tsx,ReactErrorBoundary.tsx}`, `src/react/ScaledAsciiSkeleton.tsx` | `src/components/*`, `packages/scaffold/GridHalf.tsx`, `packages/react/*` | import paths only |
| `scripts/derive/index.ts` | - | now also records `traceFiles` (gallery trace SVG names) so prerender can set `traceUrl` without disk access |

## PORT-5 (podcast, resume, static pages, gallery data) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/pages/podcast.astro`, `podcast/[id].astro` | same names under `src/pages` | data via `src/lib/podcast.ts` (EmDash `podcasts` through derive, MIG-3). `related` ("More to discover") precomputed by `scripts/derive/index.ts` with the legacy `findNearest` |
| `src/components/Podcast{Sidebar,EpisodeMenu,EpisodeContent,Discover}.tsx` | `src/components/` (same names) | tabler -> lucide; `track("podcast_listen_clicked")` restored (PORT-7) |
| `src/carousel/BlogCarousel.module.css` | `packages/carousel/BlogCarousel.module.css` | unchanged (PORT-4 will add the carousel component beside it) |
| `src/pages/resume.astro`, `resume/[role]/[lang].astro`, `src/resume/*` | `src/pages/resume*`, `packages/resume/{Resume.astro,MantineResume.*,data.ts,styles/paper.css}` | unchanged except imports. Not ported: `packages/resume/components/*` and `fragments/resume.mdx` (unused by the pages) |
| `scripts/generate-pdfs.mjs` | `packages/resume/generate-pdfs.mjs` | serves `apps/web/dist/client`; browser = `CHROME_PATH`, else `@sparticuz/chromium` (linux), else local Chrome (macOS); `SKIP_PDFS=1` skips |
| `src/pages/{about,contact,privacy,gemini,lab}.astro`, `src/follow/Follow.astro` | same names | `lab` = `portfolio` tag list. `privacy`: consent buttons wired to `src/analytics` (PORT-7); inert unless token + production build |
| `src/pages/cv.astro`, `hero-gallery.astro` | same names | **placeholders**: `Bento` and `ParticleHero` belong to PORT-4. URLs and noindex are kept; hero-gallery renders the gallery image + trace statically. **TODO PORT-4** |
| `src/lib/gallery.ts` | `packages/utils/gallery.ts` (entry + trace URL part) | reads EmDash `gallery` through derive (MIG-3) |
| `public/*` (see TEMPLATE_DIFF) | `public/*` | duplicates |

Out of PORT-5 scope: `/umap/` and `/sitemap/` (PORT-6).

## PORT-7 (analytics, ads, RSS, sitemap)

| New file | Legacy source | Notes |
|---|---|---|
| `src/pages/rss.xml.ts`, `scripts/derive/index.ts` (writes `src/generated/rss-items.json`) | `src/pages/rss.xml.ts` | items = legacy metadata snapshot (byte-identical to legacy `dist/rss.xml`, 992 items); falls back to EmDash posts when no snapshot. **TODO DATA-1** |
| `@astrojs/sitemap` in `astro.config.mjs` | root `astro.config.mjs` | same `filter`; emits `sitemap-index.xml` + `sitemap-0.xml` into `dist/client` (works with the Cloudflare adapter) |
| `src/pages/sitemap.xml.ts` | (none; FIX-1 stub) | alias of the index so EmDash's SSR `/sitemap.xml` is not injected |
| e2e `@analytics-on` / `@analytics-off` (`e2e/features/analytics.feature`) | legacy `e2e/` | not ported; PORT-9 (needs `SITE_ENV=production PUBLIC_MIXPANEL_TOKEN=e2e-test-token PUBLIC_MIXPANEL_API_HOST=...` build) |
| `src/components/NewsLetter.tsx` | (legacy file is unused) | not ported |

| `src/pages/{about,contact,privacy,gemini,lab}.astro`, `src/follow/Follow.astro` | same names | `lab` = `portfolio` tag list. `privacy`: consent script **TODO PORT-7** (analytics forced off until `packages/analytics` is ported) |
| `src/pages/cv.astro`, `hero-gallery.astro` | same names | **placeholders (replaced in PORT-6)**: `Bento` and `ParticleHero` belong to PORT-4. URLs and noindex are kept; hero-gallery renders the gallery image + trace statically. **TODO PORT-4** |
| `src/lib/gallery.ts` | `packages/utils/gallery.ts` (entry + trace URL part) | reads EmDash `gallery` through derive (MIG-3) |
| `public/*` (see TEMPLATE_DIFF) | `public/*` | duplicates |

Out of PORT-5 scope: `/umap/` and `/sitemap/` (PORT-6), `/rss.xml`, `/sitemap-0.xml`, `/sitemap-index.xml` (PORT-7).

## PORT-6 (search, related posts, /umap/, /sitemap/, /cv/, /hero-gallery/) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/search/Search.tsx`, `src/stores/search.ts` | `packages/search/Search.tsx`, `src/stores/search.ts` | header `Search` island (`client:idle`) and the `/year/` `SearchBanner`; index = client-side minisearch over `/api/posts/all.json` (static copy of the legacy search index, **TODO MIG-3/DATA-1** swap the source to EmDash). `search_opened`/`search_result_clicked`/`search_performed` restored (PORT-7b) via `src/search/tracking.ts`. `IPost` typed locally |
| `src/bits/Backgrounds/LetterGlitch/LetterGlitch.tsx` | `src/bits/Backgrounds/LetterGlitch/LetterGlitch.tsx` | unchanged (used by `SearchBanner`) |
| `RelatePosts` in `src/components/BlogContent.tsx`, `src/stores/relates.ts` | `packages/content/BlogContent.tsx`, `src/stores/relates.ts` | fetches the prerendered `/api/relates/<id>.json` (PORT-3; ids from the legacy embedding snapshot); `related_post_clicked` restored (PORT-7b) via `src/components/related-tracking.ts` (delegated `onClickCapture`, as legacy) |
| `src/pages/umap.astro`, `src/umap/Umap.tsx`, `src/stores/umap.ts`(+test) | `src/pages/umap.astro`, `src/components/Umap.tsx`, `src/stores/umap.ts` | `Umap.test.tsx` (jsdom) not ported |
| `src/pages/sitemap.astro`, `src/sitemap/*` | `src/pages/sitemap.astro`, `packages/sitemap/*` | tree built from EmDash posts (`getPostEntries`, year in the legacy build TZ); same count guard |
| `src/pages/cv.astro`, `src/components/Bento.tsx`, `src/shadcn/{utils,button,bento-grid}.tsx` | `src/pages/cv.astro`, `src/components/Bento.tsx`, `packages/shadcn/{lib,components}/*` | placeholder replaced; `@radix-ui/react-icons` import dropped (it was only used by commented-out code) |
| `src/pages/hero-gallery.astro` | `src/pages/hero-gallery.astro` | now mounts the real `ParticleHero` |
| View count | `src/components/ViewCount.tsx`, `src/stores/pv.ts` (PORT-1) | unchanged: still `https://pv.growgen.xyz/pv` |
| `public/llm/` (28 MB, copied in PORT-5) | `public/llm/` | **not used by search** (search is minisearch over `/api/posts/all.json`). Only legacy `src/stores/gemini.ts` (`/gemini/`) reads it, and `apps/web/src/pages/gemini.astro` is static text, so nothing in apps/web uses it today; PORT-9 / the owner can decide to drop it (28 MB, 6 static files) |

## MIG-3 (podcast + gallery in EmDash)

- `scripts/import/mig3/{import,rest}.mjs`: new, read the content submodule once (importer). `rest.mjs` duplicates the REST helper of `mig1/import.mjs` and `schema/apply.mjs` (scripts, not a package).
- `packages/fetch-podcast/src/emdash.ts` (`--emdash`): self-contained REST client; legacy JSON path untouched. CUT-2 keeps the package.
- `scripts/derive/{embed,cache,enrich}.ts` were generalised (table parameter, extra cover URLs); `media.ts` is new. `packages/prepare-gallery` is no longer used by the new site (traces come from `derive`, which reuses `packages/image-metadata`); PORT-8b part 3 removes the traces.
