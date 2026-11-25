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
| gallery trace SVG + colour set | Cloudinary image URL | `gallery_traces`, key = URL. **Frozen since PORT-8b part 3**: the 75 existing traces are served from this cache and nothing is traced any more; an image with no cached row gets a placeholder SVG (solid rect in its `bgColor`, else grey) and its colours are extracted (colours only) |
| cover colours | featured image URL (posts); episode cover URL when the CMS entry has no `color_set` | `cover_colors`, key = URL |
| city locations | city label, Google Geocoding | `geocodes`, key = label (needs `GOOGLE_API_KEY` for new cities) |
| tag/city order, legacy-only covers | seeded once | `post_hints` |

## Commands
```
pnpm --filter web derive:migrate        # idempotent; creates schema derived (+ extension vector)
pnpm --filter web derive:seed           # ONE-OFF dry run: seed the cache from the legacy generated data (content submodule)
pnpm --filter web derive:seed -- --write
pnpm --filter web derive:seed:media -- --write   # MIG-3: podcast vectors + gallery traces (needs the MIG-3 import first)
pnpm --filter web derive                # what `build` runs first
```
Database: the one the build reads (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, else `apps/web/.dev.vars`, else `wrangler.jsonc` localConnectionString; `DERIVE_DATABASE_URL` overrides). EmDash content is read with plain SQL in a `READ ONLY` transaction; only the `derived` schema is written.

## Podcast and gallery in EmDash (MIG-3)
Collections `podcasts` (150 episodes, slug = legacy_id = episode id, e.g. `--e2iv0jd`) and `gallery` (75 images, slug = legacy id with `/` -> `-`) hold the content; `derive` reads them with the same read-only SQL as posts and nothing under `apps/web` reads `src/content` any more (only the one-off importer and seed scripts, and `DERIVE_PARITY_LEGACY=1`). Gallery images are all Cloudinary URLs already; podcast covers/audio are Spotify/anchor CDN URLs: nothing is uploaded. The podcast show (channel) metadata is a constant in `src/lib/podcast.ts`. Colour sets imported from legacy live in the `color_set` field; derive fills it only for entries without one.
```
pnpm admin:local                                                    # or admin:testing (needs the repo-root .env)
node apps/web/scripts/import/mig3/import.mjs --url http://127.0.0.1:4322 [--only podcast|gallery] [--dry-run] [--update]
```
Idempotent upsert on `legacy_id`; a re-run reports `unchanged`; entries that differ from the legacy files are only reported (`differs`) unless `--update` (never clobbers admin edits). Stops (exit 3) and lists images if any gallery image is not on res.cloudinary.com. Needs the content submodule (`git submodule update --init src/content`) as the source.

New episodes: `pnpm fetch:podcast -- --emdash http://127.0.0.1:4322 [--dry-run]` creates RSS episodes missing in EmDash (published, by `legacy_id`) and writes no JSON, embeddings or UMAP; the next build derives them. Without `--emdash` the legacy JSON path is unchanged. Auth for a remote admin: `EMDASH_TOKEN` or `EMDASH_HEADERS`.

New gallery images are added in the EmDash admin (collection Gallery: title, legacy id, image URL, doc, ...). The next build gives it a colour set (legacy `getColorSet` palette, colours only) and a placeholder SVG at `/api/gallery/trace/<name>.svg` (a flat rect in `bgColor`; no potrace, Sobel or depth estimation runs). The hero then uses `bgColor` plus a blurred Cloudinary rendition instead of the trace. Existing traces stay frozen in `gallery_traces`; never delete those rows (they cannot be regenerated here).

## Catch-up (MIG-6)
Legacy posts keep being authored on `master`, which bumps the `src/content` submodule. `content:catchup` compares the submodule commit pinned by `HEAD` with the one pinned by `--ref` (default `origin/master`, run `git fetch` first), lists added / modified / renamed / deleted posts (`_docs/**/*.md(x)` only) and imports the first three with the MIG-1 importer (one run per post, `--match <legacy_id>`, source = `git archive` of the target commit in a temp dir, so the submodule need not be moved). Deleted posts are only reported, never removed from EmDash.
```
pnpm --filter web content:catchup -- --dry-run                       # plan only, no admin, no writes (the default)
pnpm admin:local                                                     # in another shell, or admin:testing
pnpm --filter web content:catchup -- --write --url http://127.0.0.1:4322 [--force] [--bump]
```
- Image guard: if any added/modified post (cover, `![](..)`, `<img>`) uses an image outside `res.cloudinary.com` (relative and local images included) the tool lists them and exits 3 without writing; rehost them first (MIG-2).
- `--bump` checks the submodule out at the target commit and stages the pointer (no commit); do it once the import succeeded so the next catch-up starts from there. Run it from the main checkout.
- Importer semantics apply: upsert on `legacy_id`, re-runs report `unchanged`, entries edited in the admin since the last import are skipped unless `--force`.
- After importing, the next build derives embeddings, relates and UMAP for the new posts (see Normal workflow). Testing / production: same command against that environment's admin, only when Lead says so.
- Tests: `pnpm --filter web exec vitest run scripts/import/mig6`.

## Apply to testing / production (Lead decides, never from an agent)
```
set -a; . ./.env; set +a
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_TESTING_POOLER_URL"
pnpm --filter web derive:migrate           # applies every supabase/migrations/*_derived_*.sql (PORT-8 + MIG-3 tables)
# 1. content: needs an admin running against that DB (pnpm admin:testing) and the MIG-1 import done
node apps/web/scripts/import/mig3/import.mjs --url http://127.0.0.1:4322        # 150 episodes + 75 gallery images
# 2. cache seeds from the legacy data (content submodule present)
pnpm --filter web derive:seed -- --write
pnpm --filter web derive:seed:media -- --write
```
Production: same with `SUPABASE_PRODUCTION_POOLER_URL` and `pnpm admin:production -- --yes-production`. Run the seeds once per environment, after the imports; without them the first build re-embeds 150 episodes and finds 75 images without a trace (the placeholders are not the legacy traces; seed `gallery_traces` from the local DB first; needs LM Studio and network for the embeddings). The CI build needs the tables (`derive:migrate`) and the imported rows, else it fails with the fix in the message.
Use the session pooler (IPv4, port 5432). The migrations are `supabase/migrations/20261125000000_derived_schema.sql` and `20261125010000_derived_podcast_gallery.sql` (`supabase db push` also works). Supabase Free supports pgvector (`create extension vector with schema extensions`); not verified against the cloud projects yet (no writes there from PORT-8). The 1024-d vectors for 995 posts take about 6 MB (1.2 % of the 500 MB limit). Each environment has its own cache; seed each once. Seeding is only valid when the DB holds the migrated legacy posts (it skips any post whose derived embedding text differs from the legacy one).

## Normal workflow
- **Edit or add a post** (EmDash admin, local or remote DB): the next build re-embeds only that post (needs LM Studio with `text-embedding-qwen3-embedding-0.6b`, `pnpm embedding:sync`), then recomputes relates for all posts and, because the corpus hash changed, the whole UMAP layout (about 2 s, Rust binary, `pnpm umap:build` once). UMAP is not incremental: any embedding change moves every point.
- **Build without the embedding model** (GitHub Actions, or the model is off): posts whose embedding is missing are left out of related posts and `/umap` (they stay in search and RSS) and a warning lists them; the old UMAP layout is reused for known posts. Run `pnpm --filter web derive` on the Mac against that environment's DB to fill the cache, then rebuild. `DERIVE_EMBED=require` makes a missing model a hard failure, `skip` never embeds.
- **No Rust binary**: the previous layout is kept (warning), the build does not fail.
- **No database / schema missing / no posts / no episodes or gallery images**: the build fails with the fix in the message. `ALLOW_EMPTY_DATA=1` builds without posts, podcast and gallery data.
- `DERIVE_PARITY_LEGACY=1` restricts to the posts the legacy pipeline knew (the 3 `.mdx` posts were never indexed there); use it only for parity checks.
- `DERIVE_SCHEMA=derived_test` points everything at a scratch schema (tests); `DERIVE_EMBED=fake` uses pseudo-embeddings and must only ever target such a schema.
- Dropping the schema is harmless: the next run re-embeds everything.

## Known differences from the legacy pipeline
- 21 posts: the legacy search index, RSS and UMAP JSON linked to an older slug (`/tech/2022/05/14/qwertlearner`); the derived data uses the real post path (`qwert-learner`).
- Posts without a heading take the title from the slug with dashes as spaces (`dont starve console`, legacy `dontstarveconsole`).
- The 3 `.mdx` posts are now indexed (search, RSS) and get embeddings once the model is available.
- Tag and city order come from the legacy frontmatter for known posts (pinned in `post_hints`), alphabetical for new ones.
- 80 posts keep a legacy cover (55 external, 25 relative) EmDash does not carry yet, pinned in `post_hints.cover`; it is ignored once the post has a `featured_image` (MIG-2).

## Embeddings via Cloudflare Workers AI (PORT-8b review fixes)
- **Provider**: `DERIVE_EMBED_PROVIDER=auto` (default) uses Workers AI `@cf/qwen/qwen3-embedding-0.6b` when `CF_ACCOUNT_ID` (or `CLOUDFLARE_ACCOUNT_ID`) and `CF_AI_TOKEN` (or `CLOUDFLARE_AI_API_TOKEN`) are set, else local LM Studio. `CLOUDFLARE_API_TOKEN` (the deploy token) is **never** used for embeddings: create a separate token with only the *Workers AI* permission. `DERIVE_EMBED_MODEL` overrides the model key (letters, digits and `@ . _ : / -` only, else the build fails).
- **Provider switch re-embeds everything**: cache rows are keyed by model id, so switching makes all rows stale. Derive re-embeds the whole corpus in one run (about 2.2k of the 10k free neurons/day; `DERIVE_EMBED_MAX` no longer exists and is ignored with a warning). If the run cannot finish (quota 429 after retries, outage, `DERIVE_EMBED=skip`, no provider), items whose `content_hash` still matches keep their old-model vector for relates and UMAP (log: "kept from a previous model"), so the corpus never shrinks because of a switch; only new or edited items are "missing". `DERIVE_EMBED=require` turns quota/outage into a hard failure. Re-run derive later to finish.
- **Same text as legacy**: both providers receive the embedding text with each newline replaced by a space (as `packages/embedding/src/embedding/embed.py`). Hashes are unchanged (computed on the original text).
- **Context limit 8,192 tokens**: Workers AI inputs are capped at about 6,000 *estimated* tokens (ASCII 0.3 token per char, other characters 1, emoji 2: CJK-safe, conservative). The tail of a longer text is cut (the log lists the ids). If the API still reports a context-length error, that item alone is cut to 60 % and retried (max 5 times); the rest of the batch is unaffected. A truncated item is cached normally under the hash of its full text.
- **Seeds**: `derive:seed` and `derive:seed:media` always tag legacy vectors with the LM Studio model id (they are LM Studio vectors), whichever provider is chosen.
- **Spot check old vs new (owner, real credentials, read-only, about 20 small requests)**: `CF_ACCOUNT_ID=... CF_AI_TOKEN=... pnpm --filter web derive:compare-embeddings -- 20` against a DB still holding the seeded LM Studio vectors. It prints the cosine per sampled post and min/median/max; expect about 0.99 or higher. If the median is lower than about 0.95, do not switch yet.
- **CI env (names only)**: `CF_ACCOUNT_ID` and `CF_AI_TOKEN` must be passed to the build step that runs `derive` (workflow files belong to Builder-Infra; not wired yet). Without them CI uses cached vectors only (D10).
