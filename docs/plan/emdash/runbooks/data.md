# Derived data runbook (PORT-8, D10/D13)

> **Planned update (`PORT-8b`, 2026-11-25):** Embeddings will move from local LM Studio / Python `uv` to **Cloudflare Workers AI `@cf/qwen/qwen3-embedding-0.6b`** (REST API, free daily Neurons, one-time chunked backfill so CI embeds new posts automatically); cover colour extraction will move out to a standalone single Cloudflare Worker (**`apps/colorize`**, reading tiny Cloudinary thumbnails without `sharp`/`potrace`); and **SVG traces** (`potrace`, Sobel, Python `depth-estimation`) will be removed (`ParticleHero` falls back to `colorSet.bgColor` / Cloudinary blurred LQIP).

Everything the site shows that is not stored in EmDash but can be computed from it is derived **at build time** by `apps/web/scripts/derive/` (first step of `pnpm --filter web build`). Nothing generated is committed. The deployed Worker only serves static files.

| Derived | From | Cached in (schema `derived`) |
|---|---|---|
| embeddings (1024-d, `text-embedding-qwen3-embedding-0.6b`) | title, category, series, tags, cities, plain text of `body_md` | `post_embeddings` (pgvector), key `legacy_id`, valid while `content_hash` (sha256 of the embedding text) and `model` match |
| relates (8 per post), search index `posts/all.json`, `rss-items.json`, `umap.json` | embeddings + content | not cached (recomputed in ~0.3 s) |
| UMAP layout | all embeddings (posts + podcast episodes) | `umap_state` (input hash, params hash, coordinates); reused while the corpus is unchanged |
| cover colours | featured image URL | `cover_colors`, key = URL |
| city locations | city label, Google Geocoding | `geocodes`, key = label (needs `GOOGLE_API_KEY` for new cities) |
| tag/city order, legacy-only covers | seeded once | `post_hints` |

## Commands
```
pnpm --filter web derive:migrate        # idempotent; creates schema derived (+ extension vector)
pnpm --filter web derive:seed           # ONE-OFF dry run: seed the cache from the legacy generated data (content submodule)
pnpm --filter web derive:seed -- --write
pnpm --filter web derive                # what `build` runs first
```
Database: the one the build reads (`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, else `apps/web/.dev.vars`, else `wrangler.jsonc` localConnectionString; `DERIVE_DATABASE_URL` overrides). EmDash content is read with plain SQL in a `READ ONLY` transaction; only the `derived` schema is written.

## Apply to testing / production (Lead decides, never from an agent)
```
set -a; . ./.env; set +a
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_TESTING_POOLER_URL" pnpm --filter web derive:migrate
# seed from the legacy data (content submodule present), after the MIG-1 import into that DB:
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_TESTING_POOLER_URL" pnpm --filter web derive:seed -- --write
```
Use the session pooler (IPv4, port 5432). The migration is `supabase/migrations/20261125000000_derived_schema.sql` (`supabase db push` also works). Supabase Free supports pgvector (`create extension vector with schema extensions`); not verified against the cloud projects yet (no writes there from PORT-8). The 1024-d vectors for 995 posts take about 6 MB (1.2 % of the 500 MB limit). Each environment has its own cache; seed each once. Seeding is only valid when the DB holds the migrated legacy posts (it skips any post whose derived embedding text differs from the legacy one).

## Normal workflow
- **Edit or add a post** (EmDash admin, local or remote DB): the next build re-embeds only that post (needs LM Studio with `text-embedding-qwen3-embedding-0.6b`, `pnpm embedding:sync`), then recomputes relates for all posts and, because the corpus hash changed, the whole UMAP layout (about 2 s, Rust binary, `pnpm umap:build` once). UMAP is not incremental: any embedding change moves every point.
- **Build without the embedding model** (GitHub Actions, or the model is off): posts whose embedding is missing are left out of related posts and `/umap` (they stay in search and RSS) and a warning lists them; the old UMAP layout is reused for known posts. Run `pnpm --filter web derive` on the Mac against that environment's DB to fill the cache, then rebuild. `DERIVE_EMBED=require` makes a missing model a hard failure, `skip` never embeds.
- **No Rust binary**: the previous layout is kept (warning), the build does not fail.
- **No database / schema missing / no posts**: the build fails with the fix in the message. `ALLOW_EMPTY_DATA=1` builds without posts and without podcast/gallery data.
- `DERIVE_PARITY_LEGACY=1` restricts to the posts the legacy pipeline knew (the 3 `.mdx` posts were never indexed there); use it only for parity checks.
- `DERIVE_SCHEMA=derived_test` points everything at a scratch schema (tests); `DERIVE_EMBED=fake` uses pseudo-embeddings and must only ever target such a schema.
- Dropping the schema is harmless: the next run re-embeds everything.

## Known differences from the legacy pipeline
- 21 posts: the legacy search index, RSS and UMAP JSON linked to an older slug (`/tech/2022/05/14/qwertlearner`); the derived data uses the real post path (`qwert-learner`).
- Posts without a heading take the title from the slug with dashes as spaces (`dont starve console`, legacy `dontstarveconsole`).
- The 3 `.mdx` posts are now indexed (search, RSS) and get embeddings once the model is available.
- Tag and city order come from the legacy frontmatter for known posts (pinned in `post_hints`), alphabetical for new ones.
- 80 posts keep a legacy cover (55 external, 25 relative) EmDash does not carry yet, pinned in `post_hints.cover`; it is ignored once the post has a `featured_image` (MIG-2).
