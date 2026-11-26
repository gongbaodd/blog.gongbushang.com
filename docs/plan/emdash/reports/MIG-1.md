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
2. ~~**Cloudinary-hosted covers are left unset.**~~ Superseded by MIG-1b (section 9): the 290 covers already on `dmq8ipket` are set directly.
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
9. **Starter and spike leftovers in the local DB (resolved in MIG-1b, section 9).** Category `general`, `updates`; tags `starter`, `example`, `diagram`, `uml`, `math`; and the spike posts `md-spike` and `spike-draft` (no `legacy_id`, so not touched). CMS-1 asked MIG-1 to replace the starter terms; this needs a delete, which is Lead's call.
10. **Shared-DB term labels.** Terms that already existed (for example `fe`, `life`, `city` rows) are reused with their current labels; the importer does not relabel them.

## 7. Escalations for Lead (no fix applied)

- **A. Cloudinary covers (290):** resolved in MIG-1b (set directly, section 9).
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

## 9. MIG-1b follow-up (branch `emdash/MIG-1b`, local only)

Lead decisions applied: (1) Cloudinary covers set directly, (2) lowercase tag labels kept, (3) overwrite guard, (4) starter and spike cleanup, (5) idempotence, verification and this report.

### 9.1 Cloudinary covers (decision 1)

- Covers already on `res.cloudinary.com/dmq8ipket` are set as `featured_image = {provider:"cloudinary", id:<public_id>, src:<original URL>, alt}`. Local and external covers stay gated behind `--rewrite=map` (unchanged).
- `public_id` comes from `apps/web/scripts/import/mig1/cloudinary-id.mjs`: drops the host, cloud, `/image/upload/`, transformation segments, the `vNNN` version, the extension and the query. Example: `.../image/upload/v1774700949/P50330-090259_gmzfch.jpg` gives `P50330-090259_gmzfch`.
- 290 posts set. One cover had a transform (`a_-360/`, post `2024/09/21/week-38-european-parliament-role-play-game`); it is stripped from the id and logged as `cloudinary-cover-transform-stripped`. `src` keeps the full URL.

### 9.2 Tag labels (decision 2)

Lowercase labels kept (legacy display). No change made.

### 9.3 Overwrite guard (decision 3)

- Every write stores `legacy_frontmatter_extra._import.hash`: sha256 over the owned fields (`title`, `legacy_id`, `legacy_date`, `body_md`, `adsense`, `series_number`, `legacy_frontmatter_extra` without `_import`, `featured_image`) and the four taxonomy slug sets. No timestamp, so re-runs give the same stamp.
- Before a PUT, the importer hashes the stored content the same way. Hash equals stamp → free to update. Hash differs → skipped as `skipped-edited` and reported, unless `--force`.
- Rows with no stamp (written by the MIG-1 run) are adopted: updated once and stamped (`adopted` count). The guard is only meaningful from this stamp onward; an admin edit made before adoption cannot be detected.
- Test on local: an admin edit (title changed and published) on `2015/02/08/haha`. Import → `skipped-edited: 1`, title left as edited. `--force` → `forced: 1`, legacy title restored. Next run → `unchanged: 1`.
- `--force` is not a default; it must be passed explicitly.

### 9.4 Starter and spike cleanup (decision 4)

Script: `apps/web/scripts/import/mig1/cleanup-leftovers.mjs` (lists first; `--execute` deletes). Check: legacy source frontmatter and live term assignments for legacy posts.

| Item | Legacy use | Action |
|---|---|---|
| category `general` | 0 posts | deleted (was on `welcome` only) |
| category `updates` | 0 | deleted |
| tag `starter` | 0 | deleted (was on `welcome` only) |
| tag `example` | 0 | deleted (was on `welcome` only) |
| tag `diagram` | 1 (`2025/09/08/mermaid`) | kept (real legacy tag) |
| tag `uml` | 1 (`2025/09/08/mermaid`) | kept |
| tag `math` | 46 posts | kept |
| post `md-spike` | no legacy_id | deleted (soft, then permanent) |
| post `spike-draft` | no legacy_id | deleted (soft, then permanent) |

Not deleted (not named by Lead; Lead to decide): `hello`, `welcome` (starter posts; `welcome` lost its `general`, `starter` and `example` assignments), `spike-three` (spike). After cleanup: 998 posts in EmDash = 995 legacy + those 3.

### 9.5 Idempotence and verification (decision 5)

| Run | Mode | Processed | Created | Updated | Unchanged | Skipped-edited | Failed | Time |
|---|---|---|---|---|---|---|---|---|
| Adoption run (stamps, 290 covers) | `none` | 995 | 0 | 995 (adopted 995; 290 set `featured_image`) | 0 | 0 | 0 | ~2 min |
| Re-run 1 | `none` | 995 | 0 | **0** | **995** | 0 | 0 | 34 s |
| Re-run 2 | `none` | 995 | 0 | **0** | **995** | 0 | 0 | 25 s |

`verify.mjs --manifest <real-run manifest>`: checked 995, body byte-identical 995, featured_image set 290, skipped-edited 0, missing 0, not published 0, body mismatch 0, duplicate legacy_id 0.

Commands run for MIG-1b:

```bash
git checkout -b emdash/MIG-1b feat/emdash
pnpm --filter web exec astro dev --port 4332            # local
node apps/web/scripts/import/mig1/import.mjs --dry-run
node apps/web/scripts/import/mig1/cleanup-leftovers.mjs --url http://localhost:4332            # list
node apps/web/scripts/import/mig1/cleanup-leftovers.mjs --url http://localhost:4332 --execute
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332                       # adoption run
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332 --match 2015/02/08/haha   # after admin edit: skipped-edited
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332 --match 2015/02/08/haha --force
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332                       # re-run 1: 0 changes
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4332                       # re-run 2: 0 changes
node apps/web/scripts/import/mig1/verify.mjs --url http://localhost:4332 --manifest <manifest>
```

Testing command (not run): `EMDASH_TOKEN=<token> node apps/web/scripts/import/mig1/import.mjs --url https://<site-url>`. It needs the `--dry-run` check first, and the skip count must be reviewed before any `--force`.

The `_rev` note above is superseded for the importer: it now checks the stamp instead of overwriting blindly.

## 10. Testing import (https://growgen-web-testing.solitary-forest-8d89.workers.dev)

**Status: STOPPED at step 3. Error rate 89% (above the 2% stop threshold).** No re-run, verify or cleanup was done against testing.

Scope as approved by Lead: testing only, no production, no Cloudinary uploads, `--concurrency 2`, `--rewrite=none`. Token passed via `EMDASH_TOKEN` from the CLI store (not printed or written to files).

### 10.1 Steps and results

| Step | Command (flags) | Result | Time (UTC) |
|---|---|---|---|
| 1 dry-run | `import.mjs --url <testing> --dry-run` | 995 posts, 622 distinct terms (category 9, city 155, tag 432, series 26). Anomalies match section 6. | <1 s |
| 2 limit 5 | `--limit 5 --concurrency 2` | created 5, updated 0, unchanged 0, failed 0. Spot check `2015/02/08/haha`: legacy_id and legacy_date correct, body sha256 `eb2529cb…` matches manifest. | 73 s |
| 3 full run 1 | `--concurrency 2 --rewrite=none` | **Aborted** in the term phase: `POST /taxonomies/tag/terms -> 503`. Terms are created before posts, so no posts were written. | 16:43:51 to 16:58:33 (about 15 min) |
| 3 full run 2 (after Lead's go-ahead to continue) | `--concurrency 2 --rewrite=none` | Completed the loop, but **890 of 995 failed**. Created 100, unchanged 5, updated 0, skipped-edited 0, failed 890. Terms created: tag 170, series 26. | 18:52:26 to 19:34:32 (2526 s, about 42 min) |

Re-run (step 4), `verify.mjs` (step 4) and `cleanup-leftovers.mjs` (step 5) were **not run**, because the error rate limit was exceeded.

### 10.2 Error rate and error types

- Failure rate: 890 / 995 = **89.4%** (run 2). Run 1 failed at 1 request in the term phase, which aborted the whole run.
- Every error seen was **HTTP 503**. The log has 883 lines with `503`. No `1102` (Workers CPU or resource limit) and no CPU-exceeded messages appeared in the importer output.
- Failure shape: `POST /content/posts -> 503` (create refused, nothing written) and `POST /content/posts/<id>/publish -> 503` (created as a draft, not published).
- The importer does not retry on 503. It logs the failure and carries on, so the run finished with exit 1 and did not stop by itself.

### 10.3 State of testing after run 2 (read-only check)

- Distinct post ids listed: 181. Published: 105 (= 5 from step 2 plus 100 created). Drafts: 76 (create succeeded, publish returned 503).
- No duplicate post ids. The `legacy_id` check did not return values from the list output, so duplicates by `legacy_id` are **not yet verified**. An earlier, paginated count gave 381, which I could not reconcile, so treat 181 as the best current figure and recheck it.
- Post-level term counts were not checked.

### 10.4 Next steps (need Lead's decision)

1. The 503s look like Worker or Hyperdrive back-pressure at concurrency 2, not a data problem. Before another run: check testing's Worker logs for the 503 cause (CPU or subrequest limits, Hyperdrive pool) and decide whether to retry 503s with backoff in the importer. This is a change to my script, so I have not made it.
2. The 76 draft posts need a publish retry. The importer's idempotent re-run should publish them, but it also needs the 503 fix.
3. Once the error rate is under 2% on a full run, do the re-run (expect 0 changes), `verify.mjs` (expect 995 byte-identical, 290 covers) and cleanup (list first).

Logs: `$TMPDIR/mig1/growgen-web-testing-solitary-forest-8d89-workers-dev-none.log` and the manifest of the same name. Run output: `/private/tmp/claude-501/-Volumes-MacData-github-blog-gongbushang-com/0ef04fa9-7cf7-45ae-8781-f6ec3d2d561b/scratchpad/full-run-2.out`.

Commands run (token from the CLI store via `EMDASH_TOKEN`, not printed):

```bash
cd apps/web && pnpm exec emdash whoami --url <testing>
node apps/web/scripts/import/mig1/import.mjs --url <testing> --dry-run
node apps/web/scripts/import/mig1/import.mjs --url <testing> --limit 5 --concurrency 2
pnpm exec emdash content get posts 01M876ZXF2M12GZ9QB4W03B46B -u <testing> --json   # spot check
node apps/web/scripts/import/mig1/import.mjs --url <testing> --concurrency 2 --rewrite=none   # run 1, aborted at term 503
pnpm exec emdash content list posts --limit=100 --status=all -u <testing> --json             # counts (read-only)
node apps/web/scripts/import/mig1/import.mjs --url <testing> --concurrency 2 --rewrite=none   # run 2, 890 failed
```

## 11. Testing import — completed via local admin (Lead, 2026-11-25)

Section 10's run through the deployed Worker failed on CPU (1102, Workers Free 10 ms). Lead re-ran the import through `astro dev` on the owner's Mac pointed at the **testing** DB (`CLOUDFLARE_ENV=testing`, testing pooler URL; DB identity probed before writing).

| | |
|---|---|
| Command | `node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4340 --concurrency 4 --rewrite=none` |
| Result | 995/995 processed — created 814, updated 76, unchanged 105, **failed 0** |
| Time | 9,214 s (~2.6 h; ~9–10 s/post, latency to ap-southeast-1) |
| verify.mjs | checked 995, body byte-identical 995, featured_image 290, missing 0, not published 0, mismatch 0, duplicate legacy_id 0 |
| Cleanup | not run — testing had no starter seed (INF-4) and spike posts never existed there; the listing scan was too slow over the pooler and was stopped |
| Idempotence re-run | not repeated on testing (proved locally twice; verify covers state) |

## 12. MIG-1c: tag label case (branch `emdash/MIG-1c`, local only)

Problem (PORT-3 "tag case"): MIG-1 stored tag term labels lowercase. Legacy keeps each post's frontmatter casing in `data.tag` (card JSON, NDJSON, relates); only links, badges and tag pages are lowercased (`packages/utils/extract.ts` `tags()`, `badges.ts` `generateTagMap`). Slugs stay lowercase and are unchanged.

### 12.1 Label rule (implemented in `mig1/import.mjs`, `tagLabelMap()`)

- Each tag slug gets one label: the frontmatter casing used by the most posts for that slug. Ties go to the casing seen first in `legacy_id` order (code-point compare). Computed over all 995 posts, so `--limit` and `--match` runs agree with a full run.
- 432 slugs; 472 distinct raw spellings. 149 slugs get a label other than the slug.
- Decision for Lead (E2): the story suggested "first-seen". I chose most-frequent because first-seen gives a label used by one post in six slugs. Six slugs differ between the two rules: `3d` (mode `3D` x5, first `3d`), `wsl2` (mode `wsl2` x5, first `WSL2`), `tailwind` (mode `Tailwind` x2, first `tailwind`), `wearos` (mode `wearos` x3, first `wearOS`), `mac` (mode `mac` x2, first `Mac`), `ml` (mode `ML` x2, first `ml`). Switching is a one-line change in `tagLabelMap()`.
- Legacy has no label rule of its own (it never shows a stored label), so this is the importer's choice, not a copy of legacy.

### 12.2 Importer changes

- New term creation uses the label from `tagLabelMap()`.
- Existing tag terms whose label differs get `PUT /taxonomies/tag/terms/<slug>` with `{label}` (slug untouched). Counted as `terms-relabeled`. Other taxonomies (category, series, city) are not relabeled; a mismatch there is logged as `label-mismatch-not-changed` (none found).
- Post hash unchanged: the overwrite-guard hash uses taxonomy slugs, not labels. So relabeling causes **0 post updates** (995 unchanged, confirmed below).
- `--dry-run` now prints tag label stats. No other flags changed.

### 12.3 Local run (dev server on port 4333, DB confirmed local: `2025/09/09/tetris-ai` present, 998 posts incl. 3 non-legacy)

| Run | Processed | Created | Updated | Unchanged | Failed | terms-relabeled | Time |
|---|---|---|---|---|---|---|---|
| Run 1 (`--url http://localhost:4333`) | 995 | 0 | **0** | 995 | 0 | **147** | 44 s |
| Re-run (idempotence) | 995 | 0 | 0 | 995 | 0 | **0** | 35 s |

- Run 1 relabeled 147 terms, while 149 slugs have a non-lowercase label. The 2-term gap is unreconciled: those two terms presumably already held the target label (not checked).
- `verify.mjs --manifest <run-1 manifest>`: checked 995, body byte-identical 995, featured_image set 290, missing 0, not published 0, body mismatch 0, duplicate legacy_id 0.
- Dev server on 4333 stopped (`astro dev stop`).

### 12.4 Rebuild and parity (`scripts/dev/parity-api.mjs`, PORT-3)

- `LEGACY_GENERATED_DIR=<legacy>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build`: exit 0, no `runtime init failed`, 1m 18s for the server build.
- **The tag-case diff is still there.** Cause is outside my lane: `apps/web/src/lib/content.ts` line 61 maps `terms.tag` to `t.slug`, so the new labels never reach `data.tag`. Example: `cards/2015/08/23/pebblejs-pebble.json` has `"tag":["pebble"]` in the new build, legacy `"tag":["Pebble"]`. The fix is PORT-3 code, not the importer.
- Diffs remaining after the rebuild (files differing, from `parity-api.mjs`):
  - `data.tag[]`: all listings (`all/*.ndjson` 588, `tag/<x>` 1296, `year/*` 294, `series/*` 200, `world/*` 75, `relates/*` 2283, `cards/<id>` 284, `cards/latest.json` 1, `peak.json` 22). This is the tag-case issue.
  - `data.cover.url`: 50 (`all`), 192 (`relates`), 25 (`cards`), others. Local `./x.png` vs legacy `/_astro/...`; MIG-2.
  - `data.layout`: 12 (`all`), 119 (`relates`), 6 (`cards`), 11 (`tag`), 6 (`year`), 1 (`series`). Word-count bucket; unchanged from PORT-3.
  - `data.bgColor` / `titleColor`: 2 (`all`), 4 (`relates`), 1 (`year`), 1 (`peak`). Color sets; not checked here.
  - `heatmap/all.json`: per-day values (unchanged from PORT-3 item 4).
  - `tag/all.json`: `c#` href `/tag/c%23` vs legacy `/tag/c#` (intended, PORT-3 item 5), and a count-1 tie order (`pixi.js`/`daisyui`, unchanged). Labels in `tag/all.json` are already lowercase slugs in both builds.
  - `year/covers.json`: 2015/2016/2023 cover order (unchanged from PORT-3 item 6).
  - `cards/history.json`: build-day dependent (unchanged).
  - Byte-identical or matching: `posts/all.json`, `posts/umap.json`, `category/all.json`, `series/all.json`, `world/map.json`, `gallery/trace/*.svg` (75), `podcast/*.ndjson` (10).

### 12.5 Escalations for Lead

- **E2 (label rule):** most-frequent casing (chosen) or first-seen (story suggestion). Six examples in 12.1.
- **E3 (port reads slugs):** PORT-3 owner must change `apps/web/src/lib/content.ts` line 61 to use `t.label` for `data.tag`, and for slugs with several casings, read the per-post casing from the legacy record `tags` (already used by `reorderLike`) so the parity diff disappears. Not done here (lane).
- **E4 (not checked):** the 2-term gap in 12.3, and whether tie-breaks should follow legacy build (glob path) order instead of `legacy_id` code-point order. Only the six slugs in 12.1 were compared.

### 12.6 Commands run

```bash
git switch -c emdash/MIG-1c feat/emdash                 # worktree branch for MIG-1c
pnpm install --frozen-lockfile
cp <main checkout>/apps/web/.env apps/web/.env          # EMDASH_ENCRYPTION_KEY only (git-ignored)
node apps/web/scripts/import/mig1/import.mjs --dry-run
pnpm exec astro dev stop                                  # nothing running
pnpm exec astro dev --port 4333                           # local (shared Supabase 127.0.0.1:54322)
node <scratchpad>/dbcheck.mjs http://localhost:4333 2025/09/09/tetris-ai   # read-only: found, 998 posts
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4333     # run 1: terms-relabeled 147
node apps/web/scripts/import/mig1/import.mjs --url http://localhost:4333     # re-run: terms-relabeled 0, 0 changes
node apps/web/scripts/import/mig1/verify.mjs --url http://localhost:4333 --manifest <run-1 manifest>
pnpm exec astro dev stop
LEGACY_GENERATED_DIR=<legacy>/src/content/generated CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build
node apps/web/scripts/dev/parity-api.mjs <legacy>/dist apps/web/dist/client --examples
```

Testing command (not run; Lead runs it through the local admin, per section 11): `node apps/web/scripts/import/mig1/import.mjs --url <testing-local-admin> --dry-run`, then the real run with `--concurrency 4 --rewrite=none`. Expect `terms-relabeled` ≈ the count of tag terms whose label is not lowercase on that DB, and 0 post updates.

## 13. MIG-1d: Cloudinary image rewrite on testing (2026-11-25)

Target: **testing** DB only, via the local admin (`pnpm admin:testing`, http://127.0.0.1:4322). Probe: `PROBE OK … TESTING`. The local DB and production were not touched. No Cloudinary uploads were made; the rewrite used the existing `mig2/upload-result.json` (934 `uploaded`).

Commands run:
```
pnpm admin:stop
pnpm admin:testing                                   # PROBE OK, TESTING
node apps/web/scripts/import/mig1/import.mjs --url http://127.0.0.1:4322 --rewrite=map --dry-run
node apps/web/scripts/import/mig1/import.mjs --url http://127.0.0.1:4322 --rewrite=map --concurrency 4
node apps/web/scripts/import/mig1/verify.mjs --url http://127.0.0.1:4322 --manifest <map.manifest.json> --expect body_sha256
node apps/web/scripts/import/mig1/verify.mjs --url http://127.0.0.1:4322 --manifest <map.manifest.json>    # default legacy expectation, for comparison
pnpm admin:stop
pnpm deploy:testing:build                            # exit 0, not deployed
```

### 13.1 Import result (testing)

| Processed | Created | Updated | Unchanged | Failed | skipped-edited | Time |
|---|---|---|---|---|---|---|
| 995 | 0 | 184 | 811 | 0 (0 %) | 0 | 4758 s (~79 min) |

- Terms: 0 created; 149 tag labels relabelled to the original casing (MIG-1c fix). Category 9, city 155, tag 432, series 26 were already present.
- Updated rows by field: `body_md` + `legacy_frontmatter_extra` 106; `body_md` + `legacy_frontmatter_extra` + `featured_image` 36; `legacy_frontmatter_extra` + `featured_image` 42. Total body rewrites 142 posts (916 body refs), cover set on 78 posts (`featured_image`).
- Dry run: the dry run does not read the DB (every manifest row is `planned`), so the "would change" counts above come from the real run's log, not from the dry run. Dry-run totals: 995 posts, 916 body refs rewritable, covers: none 626, cloudinary-direct 290, rewritten 78, no-map-entry 1.
- Pace: ~10 s per changed post early on, ~3–4 s per post on average; unchanged posts are cheaper.

### 13.2 verify.mjs

- `--expect body_sha256` (the manifest's rewritten hash): **995 checked, 995 bodyByteIdentical, 0 missing, 0 notPublished, 0 duplicateLegacyIds, 0 bodyMismatch.**
- Default expectation (`legacy_body_sha256`): 853 identical, **142 bodyMismatch**, 0 missing, 0 notPublished, 0 duplicate. These 142 are the rewritten bodies, as expected. The only changes are the Cloudinary URLs for rehosted refs (sampled in the manifest: changed `body_md` only in rewritten refs). verify flags them because it compares against the legacy hash by default; use `--expect body_sha256` for this mode.

Observation for Lead: `legacy_frontmatter_extra` was written on all 184 updated rows, not only on the 142 body rewrites. Probably the earlier testing rows lacked that key, but I did not confirm it against the DB. Checked on the 184 rows of the manifest; no field other than body_md, featured_image, legacy_frontmatter_extra changed.

### 13.3 Built HTML (`apps/web/dist/client`, `pnpm deploy:testing:build`, exit 0)

- 1,812 HTML files. 4,827 `<img>` tags in total.
- Relative image refs (`./`, `../`, or bare filename): **0**.
- Root-relative refs: 1,145 `/profile.jpg` (site avatar) and **1** `/2025/08/18/record.gif` (in `fe/2025/08/18/blog-cards/index.html`; file exists in dist, it is a page-URL image, left as-is per MIG-2).
- Cloudinary image refs in the built HTML: 5,260 (3,385 unique URLs, including the non-`<img>` preload/OG references).
- Non-Cloudinary external `<img>` tags in **post sections** (fe 33, plan 19, tech 9, movie 4, life 3 = 68): the dead or page-URL refs MIG-2 kept as-is (expected ~70 dead, 5 page-URL). Examples: `http://commons.wikimedia.org/wiki/Special:FilePath/Caraco%20MET%20DT4670.jpg`, `https://img3.doubanio.com/view/photo/l/public/p2564556863.webp`, `https://developer.getpebble.com/assets/images/getting-started/pebble-js-tutorial/1-fetching.png`.
- Outside post content (not in scope of this import): podcast 301 (CloudFront, from a separate podcast source), resume 4 (itch.zone, PDF page).
- `curl -I` on 5 sampled rewritten Cloudinary URLs: all **200** (`image/jpeg` / `image/png`).

Open item for Lead: post `moon-rider` (2025/06/27) cover is still the external `roadtovrlive-5ea0.kxcdn.com` URL (`no-map-entry`, not uploaded). That is the one cover not rewritten.

Build status: `apps/web/dist` is built from testing settings (`SITE_ENV=testing`, noindex `_headers`, disallow-all robots). Ready for Lead to deploy. Not deployed by Migrator.
