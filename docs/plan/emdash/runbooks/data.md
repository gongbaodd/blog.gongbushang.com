# Derived data runbook (PORT-8, D10/D13)

> **Planned update (`PORT-8b`, 2026-11-25):** Embeddings will move from local LM Studio / Python `uv` to **Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b`** (REST API, free daily Neurons, one-time chunked backfill so CI embeds new posts automatically); cover colours stay a Node build step (legacy `getColorSet` in derive — the `apps/colorize` Worker was dropped 2026-11-25 because Cloudinary downscaling cannot reproduce legacy colours); and **SVG tracing** (`potrace`, Sobel, Python `depth-estimation`) was removed in part 3 (existing traces frozen in `gallery_traces`, placeholders for new images; `ParticleHero` falls back to `colorSet.bgColor` / Cloudinary blurred LQIP for placeholders).

Everything the site shows that is not stored in EmDash but can be computed from it is derived **at build time** by `apps/web/scripts/derive/` (first step of `pnpm --filter web build`). Nothing generated is committed. The deployed Worker only serves static files.

| Derived | From | Cached in (schema `derived`) |
|---|---|---|
| embeddings (1024-d, `text-embedding-qwen3-embedding-0.6b`) | title, category, series, tags, cities, plain text of `body_md` | `post_embeddings` (pgvector), key `legacy_id`, valid while `content_hash` (sha256 of the embedding text) and `model` match |
| relates (8 per post), search index `posts/all.json`, `rss-items.json`, `umap.json` | embeddings + content | not cached (recomputed in ~0.3 s) |
| UMAP layout | all embeddings (posts + podcast episodes) | `umap_state` (input hash, params hash, coordinates); reused while the corpus is unchanged |
| podcast embeddings (1024-d) | episode title + summary (`title|podcast|summary`) | `podcast_embeddings` (same validity rule as posts) |
| podcast "More to discover" (4 per episode) | podcast embeddings | not cached |
| gallery trace SVG + colour set | Cloudinary image URL | `gallery_traces`, key = URL. **Frozen since PORT-8b part 3**: the 75 existing traces are served from this cache and nothing is traced any more. An image with no real trace gets a placeholder SVG (solid rect in its `bgColor`, else grey); placeholders are never stored, their colours are extracted again on every build (colours only). Only placeholder rows are ever pruned: a real trace survives a changed image URL or a deleted entry |
| cover colours | featured image URL (posts); episode cover URL when the CMS entry has no `color_set` | `cover_colors`, key = URL |
| city locations | city label, Google Geocoding | `geocodes`, key = label (needs `GOOGLE_API_KEY` for new cities) |
| tag/city order, legacy-only covers | seeded once | `post_hints` |

## Commands
```
pnpm --filter web derive:migrate        # idempotent; creates schema derived (+ extension vector)
pnpm --filter web derive                # what `build` runs first
```
Database: the one the build reads (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, else `apps/web/.dev.vars`, else `wrangler.jsonc` localConnectionString; `DERIVE_DATABASE_URL` overrides). EmDash content is read with plain SQL in a `READ ONLY` transaction; only the `derived` schema is written, and not at all with `DERIVE_READONLY=1` (PR CI against production, INF-10: read-only session, no cache writes, no embeddings, colours, traces or geocoding).

## Podcast and gallery in EmDash (MIG-3)
Collections `podcasts` (150 episodes, slug = legacy_id = episode id, e.g. `--e2iv0jd`) and `gallery` (75 images, slug = legacy id with `/` -> `-`) hold the content; `derive` reads them with the same read-only SQL as posts and nothing under `apps/web` reads the legacy content: the `src/content` submodule, the MIG-3 importer, the `derive:seed*` scripts and `DERIVE_PARITY_LEGACY` were removed in CUT-2 (GON-259; the code stays in git history). Gallery images are all Cloudinary URLs already; podcast covers/audio are Spotify/anchor CDN URLs: nothing is uploaded. The podcast show (channel) metadata is a constant in `src/lib/podcast.ts`. Colour sets imported from legacy live in the `color_set` field; derive fills it only for entries without one.

New episodes: `pnpm fetch:podcast -- --emdash http://127.0.0.1:4322 [--dry-run]` (code in `apps/web/scripts/podcast`) creates RSS episodes missing in EmDash (published, by `legacy_id`) and writes no JSON, embeddings or UMAP; the next build derives them. `--emdash` is required. The admin's podcast sync button (GON-265) does the same from the browser. Auth for a remote admin: `EMDASH_TOKEN` or `EMDASH_HEADERS`.

New gallery images are added in the EmDash admin (collection Gallery: title, legacy id, image URL, doc, ...). The next build gives it a colour set (legacy `getColorSet` palette, colours only) and a placeholder SVG at `/api/gallery/trace/<name>.svg` (a flat rect in `bgColor`; no potrace, Sobel or depth estimation runs). The hero then uses `bgColor` plus a blurred Cloudinary rendition instead of the trace.

### Gallery traces: carry over, back up, recover
- **A new environment needs the real traces.** The 75 legacy traces exist only in `derived.gallery_traces` (and in the legacy content repo's `_gallery`). The seed script that read them from the submodule is gone (CUT-2d), so copy them from an environment that has them: `node apps/web/scripts/sync/pull.mjs <source> --to <target> --include-derived` (see `content-sync.md`), or restore a backup (below). A build against an empty `derived` schema serves placeholders for all 75 images (their URLs still resolve, but the real traces are missing).
- **Real traces are the only copy that cannot be recomputed here.** Keep the backup below. If every copy is lost, the SVGs are still in the legacy content repo (`gongbaodd/gongbaodd.github.io`, `_gallery/`) and `apps/web/scripts/derive/seed-media.ts` can be recovered from git history (commit before `chore(cut-2d)`), which re-inserts them and overwrites whatever row exists, placeholders included. Placeholders are not stored, so there is nothing stale to clean up.
- **Backup**: `pg_dump --data-only -t derived.gallery_traces "$DATABASE_URL" > gallery_traces.sql` (local or the cloud project, read only) before risky changes to the `derived` schema; restore with `psql -f`.
- Pruning never deletes a real trace (`pruneTraces` only removes placeholder rows whose image left EmDash, and an empty read prunes nothing).

## Catch-up (removed)
MIG-6 `content:catchup` and MIG-7 `scripts/import/mig7/catchup.mjs` imported posts and gallery items from the legacy `src/content` submodule. The submodule is gone (CUT-2) and the EmDash admin is the only place content is authored, so both were deleted in CUT-2d (GON-259), together with the other MIG importers (`scripts/import/mig0`..`mig7`). Reports in `reports/` keep the history, and the code is in git before `chore(cut-2d)`.

## Apply to production (Lead decides and the OWNER must confirm first, never from an agent)
INF-10 removed the `testing` environment: the project that used to be `testing` (`ckpozotzgubrjbjstvjg`) is production now, so the step below writes to **production**. Before running anything, check whether MIG-3 is already there: `select to_regclass('derived.podcast_embeddings'), to_regclass('derived.gallery_traces')` and the row counts of `ec_podcasts` (150) and `ec_gallery` (75). If the tables or rows are missing, the PR CI build (read-only derive) and the deploy build both fail with the fix in their message, so this must be applied (with the owner's go-ahead) before the first deploy.
```
set -a; . ./.env; set +a
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_PRODUCTION_POOLER_URL"
pnpm --filter web derive:migrate           # applies every supabase/migrations/*_derived_*.sql (PORT-8 + MIG-3 tables)
```
The content (150 episodes, 75 gallery images, all posts) is already in the production database, and the first `derive` build fills the cache.
A fresh local database gets content and the cache from production with `content:pull ... --include-derived` (`content-sync.md`); otherwise the first build re-embeds 150 episodes and serves 75 placeholders instead of the real traces (see "Gallery traces"; the embeddings also need Workers AI credentials). The CI build needs the tables (`derive:migrate`) and the content rows, else it fails with the fix in the message.
Use the session pooler (IPv4, port 5432). The migrations are `supabase/migrations/20261125000000_derived_schema.sql` and `20261125010000_derived_podcast_gallery.sql` (`supabase db push` also works). Supabase Free supports pgvector (`create extension vector with schema extensions`); verified on the cloud project. The 1024-d vectors for 995 posts take about 6 MB (1.2 % of the 500 MB limit). Local and production each have their own cache; copy it with `content:pull --include-derived` instead of recomputing.

## Normal workflow
- **Edit or add a post** (EmDash admin, local or remote DB): the next build re-embeds only that post (needs Workers AI credentials: `CF_ACCOUNT_ID` and `CF_AI_TOKEN`), then recomputes relates for all posts and, because the corpus hash changed, the whole UMAP layout (about 2 s, Rust binary, `pnpm umap:build` once). UMAP is not incremental: any embedding change moves every point.
- **Build without the embedding model** (GitHub Actions, or the model is off): posts whose embedding is missing are left out of related posts and `/umap` (they stay in search and RSS) and a warning lists them; the old UMAP layout is reused for known posts. Run `pnpm --filter web derive` on the Mac against that environment's DB to fill the cache, then rebuild. `DERIVE_EMBED=require` makes a missing model a hard failure, `skip` never embeds.
- **No Rust binary**: the previous layout is kept (warning), the build does not fail.
- **No database / schema missing / no posts / no episodes or gallery images**: the build fails with the fix in the message. `ALLOW_EMPTY_DATA=1` builds without posts, podcast and gallery data.
- `DERIVE_SCHEMA=derived_test` points everything at a scratch schema (tests); `DERIVE_EMBED=fake` uses pseudo-embeddings and must only ever target such a schema.
- Dropping the schema is harmless: the next run re-embeds everything.

## Known differences from the legacy pipeline
- 21 posts: the legacy search index, RSS and UMAP JSON linked to an older slug (`/tech/2022/05/14/qwertlearner`); the derived data uses the real post path (`qwert-learner`).
- Posts without a heading take the title from the slug with dashes as spaces (`dont starve console`, legacy `dontstarveconsole`).
- The 3 `.mdx` posts are now indexed (search, RSS) and get embeddings once the model is available.
- Tag and city order come from the legacy frontmatter for known posts (pinned in `post_hints`), alphabetical for new ones.
- 80 posts keep a legacy cover (55 external, 25 relative) EmDash does not carry yet, pinned in `post_hints.cover`; it is ignored once the post has a `featured_image` (MIG-2).

## Embeddings via Cloudflare Workers AI (PORT-8b review fixes)
- **Provider**: `DERIVE_EMBED_PROVIDER=auto` (default) uses Workers AI `@cf/qwen/qwen3-embedding-0.6b` when `CF_ACCOUNT_ID` (or `CLOUDFLARE_ACCOUNT_ID`) and `CF_AI_TOKEN` (or `CLOUDFLARE_AI_API_TOKEN`) are set. Without them derive skips embedding (cache hits only; `DERIVE_EMBED=require` fails). The local LM Studio / Python provider was retired (GON-255); `DERIVE_EMBED_PROVIDER=local` is rejected. `CLOUDFLARE_API_TOKEN` (the deploy token) is **never** used for embeddings: create a separate token with only the *Workers AI* permission. `DERIVE_EMBED_MODEL` overrides the model key (letters, digits and `@ . _ : / -` only, else the build fails).
- **Provider switch re-embeds everything**: cache rows are keyed by model id, so switching makes all rows stale. Derive re-embeds the whole corpus in one run (about 2.2k of the 10k free neurons/day; `DERIVE_EMBED_MAX` no longer exists and is ignored with a warning). If the run cannot finish (quota 429 after retries, outage, `DERIVE_EMBED=skip`, no provider), items whose `content_hash` still matches keep their old-model vector for relates and UMAP (log: "kept from a previous model"), so the corpus never shrinks because of a switch; only new or edited items are "missing". `DERIVE_EMBED=require` turns quota/outage into a hard failure. Re-run derive later to finish.
- **Same text as legacy**: the embedding text has each newline replaced by a space (as the former Python embedder did). Hashes are unchanged (computed on the original text).
- **Context limit 8,192 tokens**: Workers AI inputs are capped at about 6,000 *estimated* tokens (ASCII 0.3 token per char, other characters 1, emoji 2: CJK-safe, conservative). The tail of a longer text is cut (the log lists the ids). If the API still reports a context-length error, that item alone is cut to 60 % and retried (max 5 times); the rest of the batch is unaffected. A truncated item is cached normally under the hash of its full text.
- **Legacy vectors**: the vectors seeded from the legacy pipeline carry the LM Studio model id (they are LM Studio vectors), whichever provider is chosen now.
- **Spot check old vs new (owner, real credentials, read-only, about 20 small requests)**: `CF_ACCOUNT_ID=... CF_AI_TOKEN=... pnpm --filter web derive:compare-embeddings -- 20` against a DB still holding the seeded LM Studio vectors. It prints the cosine per sampled post and min/median/max; expect about 0.99 or higher. If the median is lower than about 0.95, do not switch yet.
- **CI env (names only)**: `CF_ACCOUNT_ID` and `CF_AI_TOKEN` are passed to the `web-deploy` build step (GON-266: `CF_AI_TOKEN` secret, account id from the job-level `CLOUDFLARE_ACCOUNT_ID`). Without them derive uses cached vectors only (D10).
