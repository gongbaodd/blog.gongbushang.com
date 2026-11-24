# MIG-1 report: post importer, local run

Branch `emdash/MIG-1` (from `feat/emdash`). Owner: Migrator. Target: **local** only (`http://localhost:4332`, shared local Supabase at 127.0.0.1:54322). Nothing was imported into testing or production.

Script: `apps/web/scripts/import/mig1/import.mjs`. Parity helper: `apps/web/scripts/import/mig1/verify.mjs` (read-only).

## 1. Result

| Run | Mode | Processed | Created | Updated | Unchanged | Failed | Time |
|---|---|---|---|---|---|---|---|
| Full run 1 | `--rewrite=none` | 995 | 982 | 6 | 7 | 0 | 45 s |
| Re-run (proof of idempotence) | `--rewrite=none` | 995 | **0** | **0** | **995** | 0 | 24 s |

- The 7 "unchanged" in run 1 were rows created or updated by the earlier `--limit 5` and `--match` runs (see section 4).
- The 6 "updated" in run 1 were rows that already existed locally with the same `legacy_id` from earlier test imports on the shared local DB (see anomaly 6). Their body and frontmatter were replaced by the legacy values.
- Totals across the session (all runs): created 989 posts, updated 11 posts, failed 0.
- Verification: `verify.mjs` on the real-run manifest: 995 checked, **995 body_md byte-identical** (sha256 of stored `body_md` equals the legacy body hash), 0 missing, 0 not published, 0 duplicate `legacy_id`.
- Spot check with `emdash content get posts <id> --json`: `2019-02-24-grass-list` is published, `legacy_frontmatter_extra.type = "draft"`, the body keeps its CRLF line endings; `2015-02-08-haha` was checked by hashing the CLI output (`eb2529cb…` matches the manifest).

## 2. Taxonomy terms

Created by the importer (exact legacy slug, label as listed in section 4 item 9):

| Taxonomy | Planned distinct | Created | Already present (reused) |
|---|---|---|---|
| category | 9 | 6 (`music`, `tech`, `sport`, `plan`, `movie`, `tv`) | fe, life, book, general and updates (starter seed) |
| tag | 432 (lowercased) | 423 (includes `c#`, `godot`) | 13 spike and starter tags (`starter`, `example`, `diagram`, `uml`, `math`, ...) |
| series | 26 | 24 | 2 |
| city | 155 | 148 | 7 |

`c#`: created as slug `c#`, label `c#`. Assignment through `taxonomies: { tag: ["c#"] }` on create/update works, and `GET /content/posts/<id>/terms/tag` returns it. Only the REST term GET by slug is affected (CMS-1 finding), and the importer never fetches a term by slug; it lists the taxonomy once per run.

## 3. How the importer works

- **Source**: legacy `src/content/_docs` in the main checkout (995 files, 992 `.md` + 3 `.mdx`). Glob ids come from `mig0/lib.mjs` `globId()` with the same slugger, so `legacy_id` is identical to MIG-0's. `legacy_date` comes from the folder path.
- **Frontmatter**: parsed with the Astro 7.3.3 rule (`@astrojs/internal-helpers` regex, "remove" mode, `yaml` 2.9.1).
- **body_md**: the body Astro gives as `entry.body`, that is the source with the `---` block removed. The newline after the closing fence and the CRLF endings are kept. The H1 is kept, because the legacy page renders the whole body. Hash per post is in the manifest (`body_sha256`, `legacy_body_sha256`).
- **title**: legacy rule. Frontmatter `title` is never present (the legacy schema strips it), so it is the first heading (mdast, `mdast-util-from-markdown`) or, failing that, the last id segment with dashes turned into spaces.
- **Fields**: `title`, `legacy_id`, `legacy_date`, `body_md`, `adsense` (default false), `series_number` (null when absent), `legacy_frontmatter_extra` (`{type, ...unknown keys}`), `featured_image` (null unless applied, see section 5). Slug in EmDash: `legacy_id` with `/` → `-` (e.g. `2015-03-15-threejs`). Public URLs come from `legacy_id`, not the slug.
- **Taxonomies**: category = raw value; tag = `toLocaleLowerCase()` (legacy `tags()`); series = `series.slug`; city = legacy `citySlug()`.
- **Idempotent upsert**: the whole `posts` collection is listed once per run (cursor pages of 100, drafts included) and matched in memory on `data.legacy_id`. No match → `POST /content/posts`, then `POST /content/posts/<id>/publish` (REST create leaves a draft). Match → compare the owned fields and the four taxonomy sets (`GET /content/posts/<id>/terms/<tax>`); PUT only when something differs, then publish. Missing terms are created before posts.
- **Concurrency** 4 (max), progress every 50 posts, per-post failures are logged and the run continues (exit 1 if any failed).
- **Auth**: `EMDASH_TOKEN` (bearer) or `EMDASH_HEADERS`, same as `schema/apply.mjs`; localhost uses the dev-bypass session.
- **Logs**: `$TMPDIR/mig1/<host>-<mode>.log` and `…manifest.json`; a dry run writes `….dry-run.manifest.json` so it never replaces a real run's manifest.

### Flags

`--url` (default `http://localhost:4332`), `--limit N`, `--match <legacy_id substring>`, `--dry-run`, `--rewrite=none|map` (default `none`), `--upload-result <json>` (default `mig2/upload-result.json`), `--concurrency` (≤4), `--source <dir>`, `--token`.

`--rewrite=map` stops with exit 2 if the upload result file does not exist. It applies a rewrite only when the public id has status `uploaded` or `exists` in that file (same shape as mig2's `upload-index.json`). It was tested only in `--dry-run` with a scratch fake result (no cloud call): 916 body references would be rewritten, 0 residuals. Real `map` mode is untested until uploads exist.

## 4. Commands run

```bash
pnpm install --frozen-lockfile                       # worktree dependencies
cp <main checkout>/apps/web/.env apps/web/.env       # EMDASH_ENCRYPTION_KEY only (git-ignored); value not printed
pnpm --filter web dev --port 4332                    # local EmDash (shared local Supabase)
node apps/web/scripts/import/mig1/import.mjs --dry-run
node apps/web/scripts/import/mig1/import.mjs --limit 5
node apps/web/scripts/import/mig1/import.mjs --limit 5                       # re-run: updates the 5 drafts, publishes them
node apps/web/scripts/import/mig1/import.mjs --match 2017/05/04/1typescript  # no c# match there, plain create
node apps/web/scripts/import/mig1/import.mjs --match 2025/06/06/yknytt       # c# tag test
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332     # full run 1
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332     # re-run: 0 changes
node apps/web/scripts/import/mig1/verify.mjs --url http://localhost:4332 --manifest <real-run manifest>
pnpm --filter web exec emdash content get posts <id> -u http://localhost:4332 --json
node apps/web/scripts/import/mig1/import.mjs --rewrite=map --dry-run         # refused: no upload-result.json (exit 2)
```

Test command for later (testing/production, owner or Lead approval needed; not run):

```bash
EMDASH_TOKEN=<token> node apps/web/scripts/import/mig1/import.mjs --url https://<site-url> --dry-run
EMDASH_TOKEN=<token> node apps/web/scripts/import/mig1/import.mjs --url https://<site-url>
EMDASH_TOKEN=<token> node apps/web/scripts/import/mig1/verify.mjs --url https://<site-url> --manifest <manifest>
```

## 5. Decisions taken (for Lead to confirm)

1. **featured_image is gated like the body.** It is set only when the cover's rewrite-map entry is applied (upload succeeded). Under `none` it stays null, and the 78 covers with a map entry are recorded as "map-entry-not-applied".
2. **Cloudinary-hosted covers are left unset.** The brief says "when the cover has a rewrite-map entry, else unset". The 290 covers already on `res.cloudinary.com/dmq8ipket` have no map entry (the map excludes Cloudinary URLs), so they are unset. See escalation A.
3. **Tag labels are lowercase** (what legacy displays via `tags()`). CMS-1 wrote "original case"; this differs, so confirm.
4. **Body keeps the leading newline** after the closing fence, as Astro's `body` does.
5. **Publishing**: all 995 are published, including the 4 legacy drafts (MIG-0 decision).

## 6. Anomalies (examples capped at 3)

Counts across all 995 posts (`anomalies (all posts)` in the log).

1. **title-fallback: 18.** A `#` with no space is not a heading, so the legacy title is the slug text. Matches legacy. Examples: `2015/02/08/haha`, `2015/02/08/jquery`, `2015/02/17/archlinux-bug`. Titles like "haha" are a content question for Lead.
2. **extra frontmatter key `plan`: 1.** Kept in `legacy_frontmatter_extra.plan`. Example: `2024/03/30/week-13-3-body-steroids`.
3. **Cover on Cloudinary, no featured_image (escalation A): 290.** Examples: `2015/03/28/bohai-rim`, `2015/09/04/chengde`, `2015/09/28/all-the-way-to-west`.
4. **Cover with a map entry, not applied under `none`: 78.** Examples: `2015/08/18/b`, `2016/08/13/conquest-line-10`, `2016/11/26/where-is-the-magic-animal-…`. Filled in only by `--rewrite=map` after uploads.
5. **Cover with no map entry, external: 1.** `2025/06/27/moon-rider` (`roadtovrlive-5ea0.kxcdn.com`, not in the map).
6. **Pre-existing rows overwritten (shared local DB).** Six rows already in the local DB had the same `legacy_id` (from earlier test imports, not this run): `2015/03/28/bohai-rim`, `2017/12/20/plantuml`, `2021/02/10/matrix`, `2025/02/21/puzzle-game`, `2025/08/18/blog-cards`, `2025/09/08/mermaid`. Their `body_md` and `legacy_frontmatter_extra` were replaced; `featured_image` was cleared on `bohai-rim` and `puzzle-game`. Local only, but Lead should know these were overwritten.
7. **.mdx posts: 3.** Imported as-is into `body_md`, PORT-2 decides rendering: `2025/02/21/puzzle-game`, `2025/08/18/blog-cards`, `2025/09/09/tetris-ai`.
8. **Legacy drafts published: 4.** `2019/02/24/grass-list` (CRLF body preserved), `2026/02/12/munchen`, `2026/02/14/prague`, `2026/02/16/krakow`. Note: legacy shows them publicly today (MIG-0 section 3).
9. **Starter and spike leftovers in the local DB (not removed).** Category `general`, `updates`; tags `starter`, `example`, `diagram`, `uml`, `math`; and the spike posts `md-spike` and `spike-draft` (no `legacy_id`, so not touched). CMS-1 asked MIG-1 to replace the starter terms; this needs a delete, which is Lead's call.
10. **Shared-DB term labels.** Terms that already existed (for example `fe`, `life`, `city` rows) are reused with their current labels; the importer does not relabel them.

## 7. Escalations for Lead (no fix applied)

- **A. Cloudinary covers (290):** unset under the literal rule. Option: set `featured_image` for covers whose URL is already on `dmq8ipket` (no upload needed). Needs a decision.
- **B. Map-entry covers (78) and bodies:** need the owner's upload go-ahead. Then run `--rewrite=map` against an `upload-result.json` made from the upload index.
- **C. Titles from the first heading:** 18 posts show the slug as the title (item 1).
- **D. Starter/spike leftovers:** delete the starter terms and spike rows locally? (item 9)
- **E. Tag label casing:** lowercase (current) vs original case (CMS-1 note).
- **F. Shared DB:** 6 rows overwritten (item 6). Consider a fresh local DB before the MIG-1 testing run.

## 8. Notes

- Creation is REST, not the CLI, to keep the run fast (24-45 s locally). The CLI auto-publishes; the REST create does not, so the importer calls `publish` explicitly.
- Updates to a live entry create a draft revision until published, so every update is followed by a publish.
- `_rev` is not sent on PUT, so a concurrent edit in the admin would be overwritten by the next run. Fine for a migration; flagged for the later sync design.
- The dev server was stopped after verification.
