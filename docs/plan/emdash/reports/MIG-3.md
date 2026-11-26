# MIG-3: gallery and podcasts in EmDash (Builder-Core)

Branch `emdash/MIG-3` (from `feat/emdash`). Local only: nothing written to testing or production. Runbook: `docs/plan/emdash/runbooks/data.md` (new section + apply steps for Lead).

## Result
- Importer `apps/web/scripts/import/mig3/import.mjs` (+ `rest.mjs`): idempotent upsert on `legacy_id`. Local admin (`pnpm admin:local`, port 4322): run 1 created 150 podcasts + 75 gallery items (all published), re-run `unchanged` 150 + 75, 0 failed.
- **No image needs uploading**: all 75 gallery images are already on res.cloudinary.com (the importer exits 3 and lists them otherwise); podcast covers/audio are third-party CDN URLs. Legacy `_gallery` source and `generated/gallery.json` agree (hash, image, doc: 0 diffs).
- Derived data moved into `scripts/derive` (new `media.ts`): podcast embeddings (`derived.podcast_embeddings`), nearest episodes, gallery trace SVG + colours (`derived.gallery_traces`, key = image URL), episode colours via `cover_colors` when the CMS entry has no `color_set`. New idempotent migration `supabase/migrations/20261125010000_derived_podcast_gallery.sql`; `derive:migrate` now applies every `*_derived_*.sql`. One-off `derive:seed:media` seeds 150 vectors + 75 traces from the legacy data (skipped 0).
- `src/lib/{podcast,gallery}.ts` read derive output; the podcast channel is a constant in `podcast.ts` (no EmDash home for it). `data-guard.test.ts` now checks the build no longer depends on the submodule.
- `fetch-podcast --emdash <url> [--dry-run]` (`packages/fetch-podcast/src/emdash.ts`): creates missing episodes in EmDash, no JSON/embeddings/UMAP; legacy path unchanged. Tested: dry run against the live RSS (150 present, 0 new), a throwaway episode created then seen as existing on the second call (then deleted from the local DB).

## Verification
- Build with `src/content` renamed away and `LEGACY_GENERATED_DIR=/nonexistent`, local DB: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` exit 0 (with PDFs). Derive: `podcast: 150 episodes, embeddings 150 cached`, `umap: reused, 1145 points`, `gallery: 75 images, traces: 75 cached`; total 1.5 s.
- **Parity vs a baseline build made before the change (submodule data): `diff -rq` of `dist/client` (SKIP_PDFS build) = 0 differing files, 0 missing**, i.e. every page, `/api/podcast/*.ndjson` (10), `/api/gallery/trace/*.svg` (75) and the home hero are byte-identical. Route-parity vitest: 0 missing. `parity-api.mjs` against the old legacy `dist` (Nov 24): gallery trace 75/75 identical, relates etc. as in PORT-8; podcast ndjson differs from that old dist only in `umap2D` (the old dist predates the submodule's current UMAP layout), same as the baseline.
- `pnpm --filter web exec vitest run` 22 files / 161 tests pass; root `pnpm exec astro check` and `apps/web` `astro check`: 0 errors; root `pnpm test:unit`: 34 files passed (1 skipped), 211 tests (added `packages/fetch-podcast` to the root vitest include for the new test).
- Differences: gallery `added_at` is stored by EmDash as UTC (`...T17:26:04.000Z`) instead of `+03:00` (same instant; the nearest-image tie-break picked the same images, home page identical).

## Measurements (traces)
Cold, empty cache, 75 Cloudinary images, 4 parallel: **13.3 s** (sobel + potrace); warm 0.04 s. So traces do not need to stay generated files. With the cache only new images are traced. 8 of 75 freshly computed SVGs differ byte-wise from the legacy ones (tool/version drift); the seeded cache keeps the legacy SVGs, so output is identical.

## Open / for Lead
- **Linear GON-175 (PORT-8b) overlaps**: part 2 (`emdash/PORT-8b-embed`) rewrites `scripts/derive/embed.ts`; I generalised `embedPosts` (table parameter, `Embeddable`) so expect a merge conflict there; part 3 removes SVG traces (`gallery_traces`/`media.ts` trace code) and wires colours to `apps/colorize`. It says "best after MIG-3". I could not find a MIG-3 issue in Linear to check whether agy picked it.
- Run on testing/production: `derive:migrate`, importer, `derive:seed:media` (steps in the runbook). `emdash-env.d.ts` not regenerated (reverted); types for the two collections are not generated.
- The nothing-reads-`src/content` claim: true for `src/`, `astro.config`, derive build path. Still reading it by design: import scripts (mig0..3), `derive:seed*`, and `DERIVE_PARITY_LEGACY=1`.
- Gantt not edited (the plan file was off limits); `admin:local` stopped (`pnpm admin:stop`).

## Review fixes

Branch `emdash/MIG-3-followup` (from `feat/emdash`).

1. **Prune guards** (`scripts/derive/cache.ts`): `pruneEmbeddings` (posts and podcasts) and `pruneTraces` do nothing and warn when the keep set is empty (a read that returned 0 items means a wrong DB or a failed import, and the cache costs hours to rebuild). Decision on unpublished episodes: the podcast embedding keep set is every episode that still exists in EmDash in **any status** (`readPodcastKeys`, `deleted_at is null`), so unpublishing or reverting to draft keeps the embedding; only deleted entries lose theirs. Gallery traces follow the same rule (`readGalleryUrls`).
2. **Keyless and undated rows** (`scripts/derive/media.ts`): episodes and gallery images without `legacy_id` are no longer dropped; they are keyed by slug, then id, with a warning. A null `pub_date` falls back to `created_at` (parsed as UTC) with a warning, never 1970; an episode with no parseable date at all is skipped with a warning. `fetch-podcast --emdash` skips and warns on an unparseable RSS date and never writes `pub_date: null`. `podcasts.pub_date` is now `required` in `scripts/schema/apply.mjs`; `apply` never alters existing fields, so this only affects fresh environments (no migration of existing ones).
3. **Credentials** : `packages/fetch-podcast/src/emdash.ts` now uses `scripts/import/mig3/rest.mjs` (`createClient`, `listByLegacyId`) instead of its own copy (a `rest.d.mts` supplies types for the root check). `createClient` throws before any request if a bearer token or `EMDASH_HEADERS` would go to a non-https URL, unless the host is localhost, 127.0.0.1 or [::1]. This also covers the MIG-3 importers.
4. **Channel drift**: the show constants moved to the dependency-free `src/lib/podcast-channel.ts` (re-used by `src/lib/podcast.ts`). `fetch-podcast --emdash` warns per field when the RSS title, description or image differs.

Tests: `scripts/derive/media.test.ts` (prune guards, keyless, null and invalid dates) and `packages/fetch-podcast/src/emdash.test.ts` (null pub_date, skip, https and localhost rules, channel drift).

Verified: full `pnpm --filter web build` with PDFs, exit 0; `pnpm --filter web exec vitest run` 166 passed, 1 failed (`route-parity`: `/fe/2026/11/25/gameplay-atlas/`, the local-only MIG-6 test post; legacy-urls not edited); `astro check` in apps/web and at the root, 0 errors; root `test:unit` 219 passed, 3 skipped.
