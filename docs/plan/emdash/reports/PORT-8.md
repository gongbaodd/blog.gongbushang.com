# PORT-8: derive post data at build time from EmDash (Builder-Core)

Branch `emdash/PORT-8` (from `feat/emdash`). Decisions D10, D13. Runbook: `docs/plan/emdash/runbooks/data.md`.

## Design
`apps/web/scripts/derive/` runs first in `pnpm --filter web build` (via `tsx`) and replaces the post part of the deleted `scripts/legacy-data.mjs`.

1. **Source**: plain SQL on the DB the build uses (Hyperdrive local connection string, `.dev.vars`, `wrangler.jsonc`, or `DERIVE_DATABASE_URL`) inside a `READ ONLY` transaction (posts + `content_taxonomies` + `taxonomies`). Chosen over the dev/admin API because it needs no server, no auth and works the same on the Mac and in Actions (session pooler). EmDash content is never written.
2. **Cache**: schema `derived` created by the idempotent `supabase/migrations/20261125000000_derived_schema.sql` (`derive:migrate` applies it to any env; RLS on, no API exposure). `post_embeddings(legacy_id, content_hash, model, embedding vector(1024))` with pgvector (0.8.2 locally; `create extension vector with schema extensions`, supported on Supabase Free but **not verified on the cloud projects**: no writes to testing/production). Also `cover_colors` (key = cover URL), `geocodes` (key = city label), `post_hints` (pinned tag/city order, legacy-only covers), `umap_state` (replaces `.umap-state.json`). `content_hash` = sha256 of the exact embedding input text, so only posts whose text or the model changed re-embed.
3. **Reuse (no copies)**: `extractDataFields` (title, md2txt plain text, links, isShort), `buildPostEmbeddingText` + `embedFromText` (uv python, LM Studio, same model), `computeUmapInputHash`/`runUmapBinary` (Rust, same params, same hash so the legacy layout is reusable), `getColorSet`, `geocodeCities`. Only `findNearest` (relates) is ported (`relates.ts`, same algorithm and limit 8).
4. **Outputs**: same `src/generated/legacy-data.json`, `rss-items.json`, `public/api/posts/{all,umap}.json`, gallery traces. Podcast/gallery still read from the submodule (MIG-3); podcast embeddings join the UMAP corpus as before.
5. **One-off seed** `derive:seed` (dry run by default, `-- --write`): imports legacy embeddings/colours/geocodes/UMAP layout, matching by dash-less id (21 legacy ids use an older slugger). A vector is seeded only if the derived embedding text equals the legacy fields (title, category, series, tags, cities, plain text), so it is always valid for the content it is cached against. Result: 992 embeddings, 367 cover colours, 319 geocodes, 992 hints, UMAP 1142 points; 0 field mismatches; the 3 `.mdx` posts are not seeded (never indexed by legacy). It also checks that the corpus hash computed from the legacy files equals the legacy `inputHash` (true), so pgvector float32 storage is lossless here (all 1,169,408 values are float32-exact).
6. **Graceful (D10)**: embedding server missing -> posts without a vector are left out of relates and `/umap`, stay in search/RSS, warning lists them (`DERIVE_EMBED=require` fails instead). Rust binary missing -> previous layout kept. DB unreachable, schema missing, 0 posts, or podcast data missing -> build fails with the fix (guards kept from DATA-1; `ALLOW_EMPTY_DATA=1`).

## Verification (local Supabase, 995 posts)
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0 (derive, `check-static-routes` ok, `astro build`, post-build, 18 PDFs), 5,326 files in `dist/client`.
- `pnpm exec vitest run` (apps/web): 22 files, 161 tests pass (new `scripts/derive/derive.test.ts`: relates, entry building, hash stability, assemble, UMAP reuse/stale, guard test now spawns `tsx scripts/derive/index.ts`). `route-parity` passes (needs the PDFs; it fails with `SKIP_PDFS=1` as before).
- `pnpm --filter web exec astro check`: 0 errors, 0 warnings, 16 hints. Root `pnpm exec astro check`: 0 errors, 0 warnings, 61 hints. Root `pnpm test:unit`: 33 files passed, 1 skipped; 209 tests passed, 3 skipped. `pnpm install --frozen-lockfile` ok (only `tsx` added to apps/web devDependencies). No Rust touched, so no cargo tests; `cargo build --release -p umap` built the binary.
- `derive:migrate` run repeatedly (idempotent); `derive:seed -- --write` re-runnable.

### Parity (seeded cache, `DERIVE_PARITY_LEGACY=1` = only posts the legacy metadata knew)
- Full-site diff: baseline = `astro build` fed with the outputs of the old `legacy-data.mjs` (saved before the change), vs a build with derive. **5,308 files, 4 differ**: `_headers` (the baseline skipped `post-build`), `api/posts/all.json`, `api/posts/umap.json`, `rss.xml`. Those three differ only in the 21 posts below (+ 1 title). Every listing, card, relates, tag/series/year/world page and API is byte-identical, including relates (995 files, 0 id-sequence diffs) and the UMAP layout (hash match, "reused").
- `scripts/dev/parity-api.mjs <legacy dist> dist/client`: 0 missing files in every family; same remaining diffs as PORT-3/DATA-1 (tag case, cover URLs, layout, history/heatmap); `posts/all.json` and `umap.json` differ from legacy only in 21 `id`/`href` and 1 `title`; `gallery/trace` 75/75, `podcast` 10/10 byte-identical.
- `src/generated/legacy-data.json` before/after: podcast, channel, podcastRelated, gallery, traceFiles, umapPosts equal; 992 post keys equal; per-post record diffs only `cover.alt` for 1 post (EmDash has an alt the legacy lacked) and a stale `trace` field in one legacy colour set; geocodes round-trip exactly after `set extra_float_digits = 3` (Supabase's default 15 digits changed 68 values).

### Deliberate differences
1. 21 posts: legacy search/RSS/UMAP used an old slug (`/tech/2022/05/14/qwertlearner`, a broken link); derived uses the real path.
2. `2015/03/21/dont-starve-console` has no heading; title from the slug now has dashes as spaces (legacy `dontstarveconsole`). Its seeded vector was made with the old title text; negligible, and keeping it avoids a full UMAP recompute.
3. Default (non-parity) runs also index the 3 `.mdx` posts in search/RSS (995 posts). They have no embedding here, so they are left out of relates/UMAP with a warning, and the layout is still reused.
4. 80 posts whose legacy cover EmDash does not carry (55 external, 25 relative) keep it through `post_hints.cover` (ignored once `featured_image` exists, MIG-2).

## Incremental build (scratch schema `derived_test`, dropped afterwards; local body edit reverted)
Edited `2019/09/10/cloudflare-worker-csp` (appended a paragraph) and ran derive with `DERIVE_EMBED=fake`:
`embeddings: 991 cached, 1 embedded`; `umap: recomputed, 1142 points (1.8s)`; changed outputs: that post's `all.json` item and RSS item (1 each), relates of 11 posts (the edited post and the 10 that listed it), the edited post's own relates list, and **every UMAP coordinate** (UMAP is global, as in legacy; layout is stable only while the corpus is unchanged). Cover/colour/tag/city/location data: 0 changes. Caveat: the Qwen3 embedding model is **not installed** in this machine's LM Studio (only nomic; its models folder points at `/Volumes/Mac Data/...`, which does not exist), so the changed post got a deterministic pseudo-vector from the test-only embedder; the real embed path (`embedFromText` via uv) was not exercised, only the unchanged legacy code.

## Timing and size
- Seeded first run: derive total 1.0 to 2.3 s (read 0.6 s, embeddings 0.1 s, UMAP reuse 0.1 s, colours 0.0 to 0.6 s, write 0.3 s); full `pnpm --filter web build` 1 m 16 s without PDFs, 2 m 17 s with the 18 PDFs.
- Incremental (1 edited post, pseudo-embed): derive 2.7 s (UMAP recompute 1.8 s); plus real embedding time per changed post (not measurable here).
- Unseeded cold run (995 embeddings through uv/LM Studio): not measured (model missing).
- DB added: `derived` = **6.1 MB** after `VACUUM FULL` (post_embeddings 5.6 MB, hints 0.2, colours 0.1, umap 0.1, geocodes 0.04) = 1.2 % of Supabase's 500 MB. Before vacuum, repeated seed upserts leave dead tuples (11 MB); normal runs only write changed rows.

## Open
- Run the migration + seed against testing/production (Lead). Seed needs that DB to contain the migrated posts; remote seed is ~1,000 round trips per table (minutes over the pooler).
- Install `Qwen/Qwen3-Embedding-0.6B` in LM Studio on the Mac (fix its models path) before the first real re-embed; Actions has no model, so new posts appear in relates/UMAP only after a local `derive` against that env's DB.
- UMAP stability: any embedding change moves all points. A Procrustes alignment to the previous layout would keep `/umap` visually stable; not done (legacy semantics kept).
- GOOGLE_API_KEY is required for brand-new city strings (warned, omitted otherwise).
- Podcast/gallery still from the submodule (MIG-3); `legacy-data.ts` stays until then.
- Gantt: PORT-8 marked `active`; mark `done` after merge.
