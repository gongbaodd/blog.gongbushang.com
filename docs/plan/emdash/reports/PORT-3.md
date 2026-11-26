# PORT-3: listing pages + JSON/NDJSON APIs (Builder-Core)

Branch `emdash/PORT-3` (from `feat/emdash`). Plan E4, F3/F4, D7/D8. Built against the local DB (995 posts).

## What was built
- Pages (all `prerender = true`): `/all/` + 9 category lists (`[filter].astro`, podcast excluded: PORT-8), `/tags/`, `/tag/<t>/` (432), `/series/<s>/` (26), `/year/`, `/year/<y>/` (12), `/world/` (map placeholder for PORT-6), `/world/<city>/` (155).
- APIs: every legacy `src/pages/api/**` endpoint, same paths, page size 16, item order, key order. Data from EmDash through `src/lib/{listing-core,listing}.ts` (port of `mapServerPostToClient`, filters, badges, counts, heatmap, cards, relates, map).
- Legacy-only data (not in EmDash yet) via `scripts/legacy-data.mjs` (runs first in `build`; `LEGACY_GENERATED_DIR`, default the legacy submodule path, missing = empty). Needed because prerender runs in workerd and cannot read the disk. Compact JSON in `src/generated/`, static copies of `gallery/trace/*.svg`, `posts/all.json`, `posts/umap.json` in `public/api/` (both git-ignored). Marked TODO DATA-1/PORT-6/PORT-8 in `PORTING.md`.
- Ported components: cards, masonry (BlogPlock/PodcastPlock/SsrMasonry), BlogListMenu, Folders, stores. Tabler icons -> lucide; `track()` call removed (TODO PORT-7).
- Tests: `src/lib/listing-core.test.ts`, and `src/lib/route-parity.test.ts` (QA-1 seed, reads `dist/client`, skipped when absent; groups post, category, tag, series, year, world, api/*, plus "no built page outside legacy-urls"). Helpers `tests/built-paths.ts`; dev tool `scripts/dev/parity-api.mjs` (parity-paths.ts was folded into `pnpm --filter web parity`, QA-1).

## Verification
- `LEGACY_GENERATED_DIR=<legacy>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0, ~58 s, static-route guard passes.
- `pnpm --filter web exec vitest run` -> 7 files, 52 tests pass.
- `pnpm --filter web exec astro check` -> 0 errors, 0 warnings, 11 hints.
- `dist/client`: 5,053 files (limit 20,000). Worker dry-run: 614 modules, 19,984 KiB (smaller than PORT-1's 21,358 KiB; pages are static).

## Path parity (built vs `legacy-route-groups.json`)
| group | legacy | missing | extra |
|---|---|---|---|
| post | 995 | 0 | 0 |
| category | 10 | 0 | 0 |
| tag (incl. /tags/) | 433 | 0 | 0 |
| series | 26 | 0 | 0 |
| year | 13 | 0 | 0 |
| world | 156 | 0 | 0 |
| api/* | 3,080 | 0 | 0 |
Built paths outside legacy list: only `/.assetsignore`, `/_headers`, `/sitemap.xml` (non-page). Other groups belong to later stories (podcast 151, resume 38, static 26 missing, rss/sitemap 4 incl. `/sitemap/` treemap, gallery, other).

## API shape diff vs legacy `dist/api` (`parity-api.mjs`)
All listing/API files exist; item counts and item id sequences are identical for every NDJSON page, peak, cards and relates file (sort ties reproduced by the same comparator with id-ascending input). Byte-identical: `posts/all.json`, `posts/umap.json`, `category/all.json`, `series/all.json`, `world/map.json`, `cards/history.json`, `podcast/*.ndjson` (10), `gallery/trace/*.svg` (75), 941 of 1,121 cards, ~49% of category pages.
Remaining content diffs:
1. `data.tag[]` (most files): EmDash tags are lowercase (MIG-1 decision E), legacy kept frontmatter case. Order restored from legacy metadata when available.
2. `data.cover.url`: 25 posts with local images (`./x.png` vs legacy `/_astro/...` objects); resolved by MIG-2 uploads. 1 post (`2022/02/25/johnathan-agassi-saved-my-life`) has an external cover absent from metadata, so no cover/bgColor (MIG-2/escalation A).
3. `data.layout` (12 files, ~6 posts) one bucket larger: word count of an otherwise identical title differs; not pinned down (likely Intl.Segmenter/ICU in workerd).
4. `heatmap/all.json`: per-day values are higher by 2-22 chars on all 888 days; `countsMap` equal. Current `_docs` body char lengths equal ours (e.g. 2015-02-08 = 1491), so the legacy dist snapshot looks stale. Unverified.
5. `tag/all.json`: `/tag/c#` is `/tag/c%23` (intended); two count-1 tags swap places (tie order).
6. `year/covers.json`: 2015/2016 use legacy `/_astro` local images; 2022/2023 order of covers differs slightly.
7. `cards/latest.json` differs only in tag case; `history.json` is build-day dependent.
Titles now match (remark-smartypants applied to the stored heading text); series `name` always emitted like legacy.

## Notes / open
- Input order for sort ties is id ascending (stand-in for the glob order); it matched legacy everywhere.
- `date` instants use Europe/Tallinn (the legacy snapshot's build TZ); `dateText` is timezone-free.
- Search banner on `/year/`, `/sitemap/` treemap, map UI, `track()`: later stories.
- A fresh CI without the legacy submodule builds but emits no covers colors/relates/podcast/UMAP; DATA-1 must relocate that data before cutover.
- Gantt: PORT-3 not edited; mark `done` after merge.
