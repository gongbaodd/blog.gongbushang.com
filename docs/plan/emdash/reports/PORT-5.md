# PORT-5: podcast, gallery data, resume + PDFs, static pages (Builder-Core)

Branch `emdash/PORT-5` (from `feat/emdash`). Plan F5-F8. Built against the local DB (995 posts).

## What was built
- Podcast: `/podcast/` and 150 `/podcast/<id>/` pages (`podcast.astro`, `podcast/[id].astro`), components `Podcast{Sidebar,EpisodeMenu,EpisodeContent,Discover}`. Data through `src/lib/podcast.ts` (legacy snapshot; MIG-3 swaps only that module). `scripts/legacy-data.mjs` now also snapshots the channel and each episode's 4 nearest ids (same `findNearest` as legacy), so embeddings are not needed at prerender.
- Resume: `/resume/` + 17 `/resume/<role>/<lang>/` pages (`src/resume/*`, copied from `packages/resume`), plus **`scripts/generate-pdfs.mjs`** serving `apps/web/dist/client` and writing `dist/client/resume/pdfs/` (18 PDFs). Wired as the last step of `pnpm --filter web build`, and `pnpm --filter web resume:pdfs`.
- Static pages: `about`, `contact` (+ `Follow`), `privacy`, `gemini`, `lab` (= `portfolio` tag list), `cv`, `hero-gallery`. 404 was already done.
- Gallery: `src/lib/gallery.ts` (entry + trace URL; the 75 trace SVGs were already static copies from PORT-3).
- Public assets copied from legacy `public/` (CNAME, ads.txt, browserconfig, icons, fonts, `llm/` 28 MB, `assets/bits`, `2025/08/18/record.gif`, `resume/pdfs/.gitkeep`). Legacy `robots.txt` deliberately not copied (prerendered `robots.txt.ts` owns it).
- Tests: `route-parity.test.ts` now covers podcast, resume, static, gallery, other (`/umap/` listed in `OWNED_LATER`).
- `PORTING.md` and `TEMPLATE_DIFF.md` updated. Deps added: `@sparticuz/chromium`, `puppeteer-core` (build-time only; lockfile edited by hand, see below).

## Verification
- `LEGACY_GENERATED_DIR=<legacy>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0 (~2.5 min incl. PDFs), static-route guard ok.
- PDFs: 18/18 generated against `apps/web/dist/client`, each 1 page, 1.16-1.36 MB (limit 2 MB), no clipped sheet, name present. Browser used: local Google Chrome (macOS). On Linux/CI the script uses `@sparticuz/chromium` (same as legacy, **not exercised here**); `CHROME_PATH` overrides; `SKIP_PDFS=1` skips (then the `resume` parity group fails on the 18 PDFs).
- `pnpm --filter web exec vitest run` -> 7 files, 57 tests pass (was 52; +5 groups).
- `pnpm --filter web exec astro check` -> 0 errors, 0 warnings, 12 hints.
- `dist/client`: 5,286 files (limit 20,000); 359 MB. Worker dry-run `wrangler deploy --dry-run -c dist/server/wrangler.json`: 20,084 KiB uncompressed (limit 64 MiB); unchanged in kind (pages are static).

## Path parity (built `dist/client` vs `legacy-route-groups.json`)
| group | legacy | missing | extra |
|---|---|---|---|
| post | 995 | 0 | 0 |
| category | 10 | 0 | 0 |
| tag | 433 | 0 | 0 |
| series | 26 | 0 | 0 |
| year | 13 | 0 | 0 |
| world | 156 | 0 | 0 |
| api/* | 3,080 | 0 | 0 |
| podcast | 151 | 0 | 0 |
| resume (incl. 18 PDFs, `.gitkeep`) | 38 | 0 | 0 |
| static | 36 | 0 | 0 |
| gallery | 1 | 0 | 0 |
| other | 2 | 1 (`/umap/`, PORT-6) | 0 |
| rss/sitemap | 4 | 4 (`/rss.xml`, `/sitemap-0.xml`, `/sitemap-index.xml` PORT-7; `/sitemap/` PORT-6) | 0 |

No built HTML page is outside `legacy-urls.txt`.

## Deviations and open items
1. **Placeholders** (PORT-4 owns the components): `/cv/` (legacy = noindex Bento demo) and `/hero-gallery/` (legacy mounts WebGL `ParticleHero`). URLs and noindex kept; hero-gallery shows the gallery image and its trace SVG statically. Marked `TODO PORT-4`.
2. **`/privacy/`**: the consent script depends on `packages/analytics` (PORT-7). Analytics is forced off and the buttons are inert until PORT-7 restores `getConsent/optIn/optOut` and `PUBLIC_MIXPANEL_TOKEN`. `track("podcast_listen_clicked")` is likewise a TODO PORT-7.
3. **Data is still the legacy snapshot** for podcast and gallery (`TODO MIG-3`); a build without the legacy submodule yields an empty podcast (the `/podcast/` page exists but has no episodes), so CI must set `LEGACY_GENERATED_DIR` until DATA-1.
4. **Lockfile**: in a worktree without the `shiki-plantuml` submodule `pnpm install` prunes that importer and ~1,100 lines, so `pnpm-lock.yaml` was edited by hand (+6 lines: the two new deps under `apps/web`, versions copied from the root importer). `pnpm install --frozen-lockfile` passes.
5. `public/llm/` (28 MB) is now duplicated under `apps/web/public` for the search story (PORT-6); git dedupes the blobs. The legacy search/umap assets are served but unused until PORT-6.
6. Not ported (unused by the pages): `packages/resume/components/*`, `fragments/resume.mdx`.
7. The PDF step needs Chrome at build time. If Cloudflare/GitHub CI cannot run `@sparticuz/chromium`, PDFs need a separate step or committed output; flag for INF/QA.
8. Gantt not edited; mark PORT-5 `done` after merge.
