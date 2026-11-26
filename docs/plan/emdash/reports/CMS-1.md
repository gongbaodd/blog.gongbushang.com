# CMS-1 report: content model

Branch `emdash/CMS-1` (from `feat/emdash`). Script: `apps/web/scripts/schema/apply.mjs` (wrapper `apply.sh`). Replaces `add-body-md.sh`.

## Commands

```bash
# local: dev server on a free port (shared local Supabase DB, 127.0.0.1:54322)
pnpm --filter web dev --port 4330          # needs apps/web/.env (EMDASH_ENCRYPTION_KEY)
apps/web/scripts/schema/apply.sh -u http://localhost:4330 --check   # dry run, exit 1 if changes pending
apps/web/scripts/schema/apply.sh -u http://localhost:4330           # apply
# any other env
EMDASH_URL=https://<site> EMDASH_TOKEN=<token> apps/web/scripts/schema/apply.sh
#   (or EMDASH_HEADERS="CF-Access-Client-Id: ..\nCF-Access-Client-Secret: .." for Access)
pnpm --filter web exec emdash types -u http://localhost:4330        # also regenerates emdash-env.d.ts
astro dev stop                                                       # in apps/web
```

Build check: `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` exit 0. `pnpm exec vitest run` in apps/web: 16 passed. If that env var is unset the build falls back to `localConnectionString` in `wrangler.jsonc` (already in knowledge.md); no new root-level change needed.

The script calls the same REST API as `emdash schema` / `emdash taxonomy` (the CLI is a thin client) because the CLI cannot set `unique`, `indexed`, `validation`, widget `options`, nor create taxonomy definitions (`taxonomy` only has list/terms/add-term). Auth: `--token`/`EMDASH_TOKEN`, `EMDASH_HEADERS`, or the localhost dev bypass.

## Model

| Collection | Field | Type | Notes |
|---|---|---|---|
| posts (starter) | title, featured_image, content, excerpt | string, image, portableText, text | kept from starter. `featured_image` is the cover (see below); `content` unused (D5) |
| posts | `legacy_id` | string, unique flag, indexed | `YYYY/MM/DD/<glob slug>` |
| posts | `legacy_date` | string, indexed, pattern `^\d{4}-\d{2}-\d{2}$` | tz-free |
| posts | `body_md` | text (widget option rows=30) | already existed (S0-4), skipped |
| posts | `adsense` | boolean | |
| posts | `series_number` | number | |
| posts | `legacy_frontmatter_extra` | json | `{type:"draft"|"post", plan?:...}`; the 4 legacy drafts stay published |
| podcasts | title (req, searchable), `legacy_id` (= episode id, also the slug), link (url), pub_date (datetime), description (HTML text), summary, duration (string), audio_url (url), image_url (url), color_set (json) | | URL `/podcast/{slug}`; embeddings/umap2D are pipeline output, not stored |
| gallery | title (req), `legacy_id` (`MM/DD/name`), file, hash, image_url (url), doc, added_at (datetime), color_set (json) | | not routable; slug = legacy id with `/` -> `-` |

| Taxonomy | Attached to | Term slug | Term label |
|---|---|---|---|
| `category` (starter) | posts | raw value (all lowercase already) | raw |
| `tag` (starter) | posts | lowercased tag (`ecs`, `c#`, `aframe.js`) | original case |
| `series` (new) | posts | raw `series.slug` (mixed case kept, e.g. `Flutter-for-RN-devs`, `CSAPP`) | `series.name` or slug |
| `city` (new) | posts | `citySlug()` result | raw (`Yantai, China`) |

`pages` already exists in the starter; untouched. "Single vs multi" is not representable in an EmDash taxonomy definition: category and series are single by convention (importer assigns exactly one term; templates read `[0]`).

Cover image decision: the starter `featured_image` (image type) accepts `{id, src, alt, provider}`; a post created with `{provider:"cloudinary", id:"IMG_2523_v9ayrb", src:"https://res.cloudinary.com/...", alt:"..."}` validated and round-tripped. So no `cover_url`/`cover_alt` text fields were added; alt lives in the image value. Rendering through the Cloudinary provider is not exercised until MIG-2/CMS-2.

## Slug-control finding (D7)

Term slugs are fully controllable: `emdash taxonomy add-term tag --name X --slug 'c#'` (REST `POST /taxonomies/tag/terms {slug,label}`) stored the slug verbatim: `c#`, `aframe.js`, `Flutter-for-RN-devs` (case preserved, no slugify). A duplicate slug in the same taxonomy returns `Term 'c#' already exists` (safe to re-run an import). Content slugs also pass: podcast slug `--e2iv0jd` and gallery slug `02-03-dalian` created fine.

Caveat: the term REST routes do not decode the path param. `GET/DELETE /taxonomies/tag/terms/c%23` looks up the literal `c%23` and returns 404 (a raw `#` is a URL fragment). So terms whose slug contains `#` (and likely `%`, `?`, `/`) can be created but not fetched, edited or deleted through the REST API / admin UI by slug. I removed my test term with SQL. Impact: only `c#` is known to be affected; the site reads terms through server-side `getTerm`/entry queries (not verified for `#`). Mitigation if needed: map the display slug in the site (route `/tag/c%23/` -> term slug `c#` lookup by label), or store `c-sharp` plus a `url_slug` override; for MIG-1 verify `getEntriesByTerm("tag","c#")` early.

## Other findings

- `unique: true` is stored in field metadata only. The generated index is a plain btree, and a second post with the same `legacy_id` was accepted (201). MIG-1 importers must look up by `legacy_id` before creating.
- Field-level `validation.pattern` is enforced on create (bad `legacy_date` -> 400).
- `GET /schema/collections/<slug>` returns fields only with `?includeFields=true`, and the payload is under `data.item`.
- A new collection created through the API does not auto-add a `title` field; the script adds it.
- The starter seed terms (`category`: general, updates; `tag`: starter, example) and hierarchical `category` remain in the DB; MIG-1 should delete/replace them.

## Idempotence evidence

Run 1 (against local dev, 25 changes): `ADD posts.adsense, series_number, legacy_frontmatter_extra; CREATE podcasts (+10 fields); CREATE gallery (+8 fields); CREATE taxonomy series, city` (`legacy_id`/`legacy_date` were added by an earlier aborted attempt; `body_md` pre-existed and was skipped). Run 2: every line `ok`, `done: 0 change(s)`, exit 0. A third run with `--check`: `done: 0 change(s)`.

## Open questions

1. Accept `#` limitation, or use a `c-sharp`-style slug for that one term (breaks D7 `/tag/c%23/` unless routed)?
2. Keep `category` non-hierarchical (script does not change the starter's `hierarchical: true`; the CLI/API update was not applied since flat vs hierarchical has no URL effect here)?
3. Make `body_md` searchable? Left off (995 large bodies in the Postgres FTS table, 500 MB DB budget).
