# Derived data runbook (PORT-8, D10/D13)

Everything the site shows that is not stored in EmDash but can be computed from it is derived **at build time** by `apps/web/scripts/derive/` (first step of `pnpm --filter web build`). Nothing generated is committed. The deployed Worker only serves static files.

| Derived | From | Cached in (schema `derived`) |
|---|---|---|
| embeddings (1024-d, `text-embedding-qwen3-embedding-0.6b`) | title, category, series, tags, cities, plain text of `body_md` | `post_embeddings` (pgvector), key `legacy_id`, valid while `content_hash` (sha256 of the embedding text) and `model` match |
| relates (8 per post), search index `posts/all.json`, `rss-items.json`, `umap.json` | embeddings + content | not cached (recomputed in ~0.3 s) |
| UMAP layout | all embeddings (posts + podcast episodes) | `umap_state` (input hash, params hash, coordinates); reused while the corpus is unchanged |
| podcast embeddings (1024-d) | episode title + summary (`title|podcast|summary`) | `podcast_embeddings` (same validity rule as posts) |
| podcast "More to discover" (4 per episode) | podcast embeddings | not cached |
| gallery trace SVG + colour set | Cloudinary image URL | `gallery_traces`, key = URL (only new URLs are traced) |
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

New gallery images are added in the EmDash admin (collection Gallery: title, legacy id, image URL, doc, ...). The trace and colours are produced by the next build (cold 75 images: 13 s, 4 parallel; later builds hit the cache).

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
Production: same with `SUPABASE_PRODUCTION_POOLER_URL` and `pnpm admin:production -- --yes-production`. Run the seeds once per environment, after the imports; without them the first build re-embeds 150 episodes and re-traces 75 images (needs LM Studio and network). The CI build needs the tables (`derive:migrate`) and the imported rows, else it fails with the fix in the message.
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
