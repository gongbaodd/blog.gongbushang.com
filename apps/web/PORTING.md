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
| `src/analytics/{MixpanelHead,ConsentBanner}.astro`, `src/ads/{AdSenseHead,AdSenseSlot}.astro` | `packages/analytics/*`, `packages/ads/*` | **stubs** (render nothing); PORT-7 replaces them |

## PORT-2 (post page) - copied, originals stay until CUT-2

| New (`apps/web/`) | Legacy original | Notes |
|---|---|---|
| `src/pages/[category]/[year]/[month]/[day]/[slug].astro` | `src/pages/[category]/[year]/[month]/[day]/[slug].astro` | `getStaticPaths` from EmDash (`legacy_id` + category term); body rendered with `src/lib/markdown.ts` |
| `src/layouts/BlogPost.astro` | `packages/layouts/BlogPost.astro` | takes plain props (page does the data work); `post_read` script and related-posts island are TODO (PORT-7 / PORT-6) |
| `src/components/BlogContent.tsx` (+ `.module.css`) | `packages/content/BlogContent.tsx` | Tabler icons -> lucide; dayjs date -> `legacy_date` string; `BlogMenu` uses a simplified cover card (no `PostCard`, PORT-3) and adds series prev/next; `RelatePosts` not ported (PORT-6) |
| `src/components/MantineMain.tsx`, `GridWithMenu.tsx` (+ css) | `packages/scaffold/*` | unchanged |
| `src/utils/reading-time.ts` | `packages/utils/readingTime.ts` | unchanged |
| `src/lib/content.ts` | `packages/utils/{extract,post}.ts` (title, excerpt, links) | EmDash entry mapping; title = first heading (legacy rule), excerpt via remark + strip-markdown |
| `src/lib/mdx-lite.ts` | `packages/image/DescriptionImage.tsx` | the 3 `.mdx` posts: `<DescriptionImage>` rewritten to plain HTML at render time |
| `public/profile.jpg` | `public/profile.jpg` | author avatar |
