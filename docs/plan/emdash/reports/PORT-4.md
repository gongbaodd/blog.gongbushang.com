# PORT-4: home page (Builder-Core)

Branch `emdash/PORT-4` (from `feat/emdash`). Plan E4, F18/F19.

## What was built
- `apps/web/src/pages/index.astro` (prerender): legacy home order kept: `ParticleHero` (client:load), `MantineHeatWrapper` (client:visible), `BlogSections` (two carousels, client:visible), `WorldMap`/`GLMap` (client:idle), `Tags` (static cloud), `Footer`, all inside `MantineMain client:load`. Starter home content removed. Hydration directives identical to legacy (verified from the built HTML).
- Copied components (table in `apps/web/PORTING.md`, "PORT-4"): `src/particle-hero/**` (Three.js + GLSL), `src/carousel/*`, `src/heat/*`, `src/map/*`, `src/tags/*`, `GridHalf`, `ReactErrorBoundary`, `ScaledAsciiSkeleton`. The home has no Rapier island and no bento (legacy home never rendered them); the Rapier/WASM Vite settings are mirrored anyway.
- `src/lib/listing.ts`: added `getBadges()` and `homeGalleryImage()` (gallery entry nearest today + trace SVG url); `scripts/legacy-data.mjs` now records `traceFiles` because prerender (workerd) can't read the disk.
- `WorldMap.astro` now mounts the real maplibre `GLMap` (replaces PORT-3 placeholder; `/world/` gets it too, so PORT-6 only needs search/treemap/umap etc.). Heatmap island ported too (PORT-6 lists it; it is part of the home).
- Hero title/description were MDX fragments; now `.md` rendered with `renderMarkdown` at build (no MDX runtime).
- `astro.config.mjs`: `vite-plugin-glsl`, `optimizeDeps` include `react-plock` / exclude `onnxruntime-node` + rapier, `treeshake.moduleSideEffects: "no-external"`, `onnxruntime-node` alias to `src/empty-module.js` (`ssr.noExternal react-plock` already existed). New deps: `three`, `maplibre-gl`, `react-map-gl`, dev `vite-plugin-glsl`, `@types/three` (lockfile updated).
- Analytics `track()` calls (tag click, city open) left as TODO PORT-7. `astro check` fix: `res.json()` cast in `ParticleHero.tsx`.

## Verification
- Build: `LEGACY_GENERATED_DIR=<main>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0 (static-route guard passed, `/index.html` 326 KB).
- `pnpm --filter web exec vitest run` -> 10 files, 60 tests pass (history/latest carousel stores and `postsData` tests ported).
- `pnpm exec astro check` (apps/web) -> 0 errors, 0 warnings, 13 hints.
- Worker dry-run (`wrangler deploy --dry-run -c dist/server/wrangler.json`): **615 modules, 19,988.15 KiB** (PORT-3: 19,984 KiB; +4 KiB); upload 20,077 KiB / gzip 5,385 KiB, far below 64 MiB. Three.js/maplibre stay client-side (islands only).
- Structural comparison with legacy `dist/index.html` (jsdom script): title, description, canonical, og:title, hero text, script count, all element ids identical; h1-h3 identical except the Time Machine cards (build-day dependent: legacy dist is from 11-24); 531 links each, differences only the 3 Time Machine posts, `/tag/c%23` vs `/tag/c#` (intended), footer vercel.com -> cloudflare.com (PORT-1); 468 tag-cloud links each; islands identical except the header `Search` island (search story). No `<img>` in either.
- Runtime: `astro preview --port 4347` + headless Chrome (playwright, swiftshader): hero WebGL canvas mounted in `#home-page` (812x457), maplibre canvas with 155 markers, 16 carousel slides, 384 heatmap cells, 9 of 10 islands hydrated, no page errors. Console: GL driver performance warnings (SwiftShader), GoatCounter "not counting: localhost", and one 404 for `/favicon.svg` (also 404 in legacy). Preview stopped; no dev server running.

## Open
1. Fresh CI without the legacy submodule builds but has no gallery/UMAP/covers (hero falls back to no gallery image; DATA-1).
2. `BlogCarousel.test.tsx` not ported (needs jsdom + jest-dom in apps/web).
3. Time Machine cards depend on build date (as in legacy); rebuild-on-publish keeps them fresh only on publishes.
4. Gantt not edited; mark PORT-4 `done` after merge.
