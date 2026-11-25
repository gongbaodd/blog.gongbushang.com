# PORT-6: search, related posts, /umap/, /sitemap/, view count, /cv/, /hero-gallery/ (Builder-Core)

Branch `emdash/PORT-6` (from `feat/emdash`). Plan F17, F18, F21. No Scout note exists for PORT-6; nothing new to adopt (all client-side, legacy code reused).

## What was built
- **Search (F17)**: legacy header island ported (`src/search/Search.tsx`, `src/stores/search.ts`), mounted in `Header.astro` as `<Search slot="searchNode" client:idle />`; Spotlight CSS imported in `BaseHead.astro`. Index is client-side minisearch built from `/api/posts/all.json` (the static legacy index copy from PORT-3), then filtered by view counts from `pv.growgen.xyz`, exactly as legacy. `SearchBanner` mounted on `/year/` (closes the PORT-3 TODO). No new service; `public/llm/` is not used by search (see Open 3). `track()` is a no-op stub (TODO PORT-7).
- **Related posts**: `RelatePosts` island in `BlogContent.tsx` mounted in `BlogPost.astro` `aside` (replaces the `#related-posts` placeholder, `client:idle`). It fetches the prerendered `/api/relates/<id>.json`, which PORT-3 builds from the snapshot `relates` ids in `src/generated/legacy-data.json` (8 posts, nearest by legacy embeddings). Tracking TODO PORT-7.
- **`/umap/`** (noindex, recharts ScatterChart via `/api/posts/umap.json`) and **`/sitemap/`** (Category -> Year treemap + crawlable link list; tree from EmDash posts, same count guard as legacy). Pure `buildSitemapTree`/`cell` tests ported.
- **`/cv/`** now renders the real `BentoDemo` (shadcn Bento copied to `src/shadcn/`), **`/hero-gallery/`** mounts the real `ParticleHero`. Both keep noindex.
- **View count**: unchanged code (`ViewCount`, `stores/pv.ts`, PORT-1) still calls `https://pv.growgen.xyz/pv`; confirmed live and used by search and post cards.
- Deps added to `apps/web`: `@mantine/spotlight`, `minisearch`, `excerpt`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@radix-ui/react-slot` (lockfile via `pnpm --filter web add`; the submodule was initialised first, no pruning; a few `jiti` peer-suffix lines churned in the lockfile). `src/types/excerpt.d.ts` types the untyped `excerpt` package.
- `route-parity.test.ts`: `other` has no exemption, and `rss/sitemap` is now checked with only `/rss.xml`, `/sitemap-0.xml`, `/sitemap-index.xml` (PORT-7) exempt.
- `PORTING.md` and `TEMPLATE_DIFF.md` updated.

## Verification (all run in the worktree)
- Build + guard: `cd apps/web && LEGACY_GENERATED_DIR=<main>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm build` -> exit 0; `[check-static-routes] ok`; 0 `runtime init failed`; 18/18 resume PDFs; `dist/client` 5,316 files (limit 20,000).
- `pnpm --filter web exec vitest run` -> 13 files, 88 tests pass (route-parity 14/14 including `other` and `rss/sitemap`: `/umap/` and `/sitemap/` built, 0 missing).
- `astro check`: apps/web 0 errors, 0 warnings, 16 hints; repo root 0 errors, 0 warnings, 60 hints. Root `pnpm test:unit`: 209 pass, 3 skipped (unchanged).
- Worker dry-run (`wrangler deploy --dry-run -c dist/server/wrangler.json`): 615 modules, 20,001 KiB, Total Upload 20,090 KiB / gzip 5,387 KiB (limit 64 MiB). Unchanged in kind: all new code is client islands.
- Headless smoke (Chrome via playwright + swiftshader against `astro preview`):
  - search: `Ctrl+K` on `/` and on a post opens Spotlight, `/api/posts/all.json` (1.8 MB) and `pv.growgen.xyz/pv` load, query "docker" lists 12 results;
  - `/umap/`: 1 chart, 1,142 points; `/sitemap/`: treemap svg + 78 crawlable links;
  - post `/fe/2025/09/08/mermaid/`: "More to discover" with 8 related cards;
  - `/cv/`: 5 Bento cards, `noindex,follow`; `/hero-gallery/`: WebGL canvas 812x457;
  - no page errors. Only network error was `/favicon.svg` 404 (same as legacy). Preview stopped, no dev server running, temp scripts removed.

## pv.growgen.xyz CORS (report only; the pv service was not touched)
`GET /pv` and `OPTIONS /pv` return `access-control-allow-origin: *` (OPTIONS also `access-control-allow-methods: *`) for every origin tried: the testing Worker `https://growgen-web-testing.solitary-forest-8d89.workers.dev`, `https://next.growgen.xyz`, `https://blog.growgen.xyz`, and an arbitrary origin. **No CORS change is needed for the view-count read.**
Not verified (needs the owner, to avoid polluting stats): the **page-view write** path. `Footer.astro` loads GoatCounter `count.js` with `data-goatcounter="https://gongbaodd.goatcounter.com/count"`. GoatCounter drops hits whose host is not an allowed domain, so before cutover check GoatCounter Settings (site domain / "additional sites") accepts `next.growgen.xyz` and the `*.workers.dev` testing host; otherwise testing/next views are not counted. Paths in `/pv` are by pathname (`/404`, ...), so counts carry over when the production hostname stays the same.

## Open
1. Search and umap data still come from the legacy snapshot (`public/api/posts/{all,umap}.json`); `TODO MIG-3/DATA-1`. A build without `LEGACY_GENERATED_DIR` has an empty index and an empty umap (empty-state messages render), related posts fall back to newest-same-category.
2. `track()` for `search_opened`, `search_result_clicked`, `search_performed`, `related_post_clicked` are stubs until PORT-7.
3. `public/llm/` (28 MB, 6 static files) copied in PORT-5 is **not used by search**; only legacy `/gemini/` (`src/stores/gemini.ts`) reads it, and the ported `gemini.astro` is static text. Suggest dropping it from `apps/web/public` unless PORT-9 revives Gemini.
4. `Umap.test.tsx` (jsdom) not ported; the store test `umap.test.ts` is.
5. Lockfile has a few cosmetic `jiti` peer-suffix changes from the re-resolve; verify nothing else moved when merging (`pnpm install --frozen-lockfile` passes).
6. Gantt not edited; mark PORT-6 `done` after merge.
