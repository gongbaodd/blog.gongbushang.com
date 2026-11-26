# MIG-7: Sync New Content Updates from `master` into EmDash (GON-192)

- **Date**: 2026-11-25
- **Branch**: `emdash/MIG-7-master-sync` (based on `feat/emdash` `71a0949`)
- **Status**: Content fetched, inventoried, gaps fixed in `apps/web/scripts/import/mig7/`, `src/content` gitlink bumped to `697380543`. **Local DB caught up** on `emdash/MIG-7-fixes` (see "Review fixes"). Production is not written by agents: the owner runs §5.

---

## 1. Exact Commit Range (`old -> new`)

### Main repository (`gongbaodd/blog.gongbushang.com`)

| Milestone | Branch / Ref | Commit SHA | Date | Message | Pinned `src/content` SHA |
|---|---|---|---|---|---|
| Merge base (`feat/emdash` ↔ `origin/master`) | `master` (pre-MIG-6) | `ed219abec7b101a87db99d9df39b641e5cab4a3b` | 2026-11-24 | `leetcode` | `b7d0c046ee9732791a4786ec24104e1e2367fe54` |
| `MIG-6` baseline (merged to `feat/emdash` at `4a2d3c4`) | `master` | `bb607183aaa023043d8002325c23e90806245f37` | 2026-11-25 13:51:15 +0200 | `gameplay` | `4893092b7beb40e7edf6b68205f8e649d18226a2` |
| Latest `origin/master` HEAD | `origin/master` | `6108d10f88d78225c3aa1350ec6d516292eb9f04` | 2026-11-25 15:28:01 +0200 | `beijing` | `697380543aa357574a7c430ed952adf4a1ed0bda` |

- `git diff --stat ed219abec7b101a87db99d9df39b641e5cab4a3b..6108d10f88d78225c3aa1350ec6d516292eb9f04` shows **only `src/content`** changed on `master` (zero application/config changes).

### Content submodule (`gongbaodd/gongbaodd.github.io`, branch `astro`)

- **Range since `feat/emdash` pre-MIG-6 baseline**: `b7d0c046ee9732791a4786ec24104e1e2367fe54 -> 697380543aa357574a7c430ed952adf4a1ed0bda` (2 commits)
- **Range since `MIG-6`**: `4893092b7beb40e7edf6b68205f8e649d18226a2 -> 697380543aa357574a7c430ed952adf4a1ed0bda` (1 commit)
- **`origin/astro` HEAD**: `697380543aa357574a7c430ed952adf4a1ed0bda` (0 unpinned commits ahead of `origin/master`).
- **Gitlink bump on `emdash/MIG-7-master-sync`**: `src/content` updated `4893092b7beb40e7edf6b68205f8e649d18226a2 -> 697380543aa357574a7c430ed952adf4a1ed0bda`.

---

## 2. Complete Content & Image Inventory

### 2.1 Markdown Posts (`_docs/`)

#### Delta A: `b7d0c04 -> 4893092` (commit `4893092b7` `gameplay` — covered by MIG-6, included for environments still at `b7d0c04`)

| Change | File (`_docs/`) | Title | Date | `legacy_id` (EmDash slug) | Category | Series | Tags / Cities | Images |
|---|---|---|---|---|---|---|---|---|
| **Added** | `2026/11/25/gameplay-atlas.md` | `Gameplay Atlas: Develop & interact` | `2026-11-25` | `2026/11/25/gameplay-atlas` (`2026-11-25-gameplay-atlas`) | `fe` (existing) | `Gameplay Atlas` / `gameplay-atlas` (existing; introduced in `2026/11/19/gameplay-atlas.md`) | none | 1 cover + 50 body refs (**47 unique URLs**, cover `disco-elysium.jpg` also in body). **All 47 already on `res.cloudinary.com/dmq8ipket`**. **0 uploads needed.** |

- Canonical URL: `/fe/2026/11/25/gameplay-atlas`

#### Delta B: `4893092 -> 6973805` (commit `697380543` `beijing` — NEW since MIG-6)

| Change | File (`_docs/`) | Title | Date | `legacy_id` (EmDash slug) | Category | Series | Tags / Cities | Images |
|---|---|---|---|---|---|---|---|---|
| **Modified** | `2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md` | `并不是特别值得一去的秦汉展` | `2017-11-25` | `2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show` (`2017-11-25-its-not-a-particularly-worthwhile-qin-and-han-show`) | `life` (existing) | none | tags: none; cities: `Beijing, China`, `Shijiazhuang, China` (existing) | **Cover (added)**: `https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796` (`alt: guanyin`, **already on Cloudinary**). **Body (unchanged)**: 20 `http://ww1.sinaimg.cn/...` refs — **all 20 already uploaded in MIG-2** (`rewrite-map.json` + `upload-result.json`). **0 uploads needed.** |

- Canonical URL: `/life/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show`
- Exact frontmatter diff: added `cover.url` and `cover.alt: guanyin` only; post body is byte-identical to `b7d0c04`.
- Cover `f_auto,q_auto/` transform prefix: `apps/web/scripts/import/mig1/cloudinary-id.mjs` strips leading delivery transforms cleanly, deriving `featured_image.id = "growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796"` while keeping the full delivery URL in `featured_image.src`.

##### Full Verification of All 20 Legacy Body Images in `It's-not-a-particularly-worthwhile-Qin-and-Han-show.md`

Every external URL in the body already maps to an uploaded Cloudinary asset under `https://res.cloudinary.com/dmq8ipket/image/upload/` (verified against `apps/web/scripts/import/mig2/rewrite-map.json` and `upload-result.json`):

| # | Legacy Source URL (`ww1.sinaimg.cn`) | MIG-2 Cloudinary `public_id` | MIG-2 Status |
|---|---|---|---|
| 1 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkd44in0j23vc2kw1l5.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/700faaa96a08` | `uploaded` |
| 2 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkcz7q93j22kw3vc4qw.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/9feef6456374` | `uploaded` |
| 3 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkcygx92j23vc2kwu14.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/275782d9fa6c` | `uploaded` |
| 4 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkcxpaygj23vc2kw7wp.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/5fe5c4b5ede1` | `uploaded` |
| 5 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkcauo4dj22kw3vc1l5.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/a326f320a15e` | `uploaded` |
| 6 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkhetmk6j23vc2kwnpk.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/9be2b8d7e679` | `uploaded` |
| 7 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkiah2o0j23vc2kwu13.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/922f3559c283` | `uploaded` |
| 8 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvki8vhg9j23vc2kwu14.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/8dd8bfcb8582` | `uploaded` |
| 9 | `http://ww1.sinaimg.cn/large/89d0a2e1ly1flvkh2zrl9j23vc2kwhe0.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/e9306872ac92` | `uploaded` |
| 10 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvki8g3tdj23vc2kwu14.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/9d2eb4ce7e84` | `uploaded` |
| 11 | `http://ww1.sinaimg.cn/large/89d0a2e1ly1flvkhofg03j23vc2kw1l5.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/469eb62db9eb` | `uploaded` |
| 12 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvki7w3pbj23vc2kwkjs.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/0316359b649a` | `uploaded` |
| 13 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvk75fn8qj23vc2kwx6w.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/dee27d6a806e` | `uploaded` |
| 14 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvk70ny78j23vc2kwb2h.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/f07a6ed9fc3c` | `uploaded` |
| 15 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvk7b6vhjj23vc2kwhe1.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/de28add4f87a` | `uploaded` |
| 16 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvk7etysqj23vc2kwnpk.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/af7751e1a797` | `uploaded` |
| 17 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvjwxzltrj23vc2kwqvd.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/40dbf51330e0` | `uploaded` |
| 18 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvk6uomu9j23vc2kwhe0.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/5ccb04f7e5f5` | `uploaded` |
| 19 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkk8i2ppj23vc2kw1l5.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796` | `uploaded` (also used as cover & gallery image) |
| 20 | `http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkk19oytj23vc2kwkjs.jpg` | `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/d351c05e957e` | `uploaded` |

### 2.2 Gallery Items (`_gallery/`)

| Change | File (`_gallery/`) | `legacy_id` | EmDash Slug | `doc` | Image URL | Cloudinary? | `generated/gallery.json` Hash Match |
|---|---|---|---|---|---|---|---|
| **Added** | `11/25/beijing.json` | `11/25/beijing` | `11-25-beijing` | `/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show` | `https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796` | Yes (`0` uploads needed) | Verified (`37619332912620b998d96f2cecef5710e596857ae797a441159387c4dced2cd2`; 76 total gallery items) |

- Precomputed `colorSet` in `generated/gallery.json`: `{ "bgColor": "#997551", "titleColor": "--mantine-color-dark-8" }`, `addedAt`: `2026-11-25T13:27:46.715Z`.

### 2.3 Podcasts & Taxonomies

- **Podcasts**: 0 additions or modifications (`generated/podcast/` unchanged).
- **New taxonomy terms**: 0 new terms across `category`, `tag`, `series`, `city`.

---

## 3. Audit of `MIG-6`'s `catchup.mjs` & Gaps Resolved in `apps/web/scripts/import/mig7/`

Running `node apps/web/scripts/import/mig6/catchup.mjs --dry-run` against `origin/master` (`6108d10` → `src/content` `697380543`) **failed with exit code 3** and revealed **five concrete gaps** when syncing real-world `master` edits:

1. **Image guard false-positive on modified historical posts (exit 3)**:
   `mig6/catchup.mjs` checks raw `_docs/` markdown with `offCloudinary()` without consulting `apps/web/scripts/import/mig2/rewrite-map.json` + `upload-result.json`. Because MIG-2 rewrites legacy image URLs at import time rather than mutating `src/content`, editing *any* historical post that still contains `ww1.sinaimg.cn` (or local) URLs causes `mig6/catchup.mjs` to abort with exit 3 even though all 20 URLs are already uploaded on Cloudinary.
2. **Silent image regression (`--rewrite=none`)**:
   `mig6/catchup.mjs` invokes `mig1/import.mjs` without `--rewrite=map`. On a database that holds the MIG-2 body rewrite (production), re-importing `It's-not-a-particularly-worthwhile-Qin-and-Han-show.md` with `--rewrite=none` would put hotlink-gated `http://ww1.sinaimg.cn/...` URLs back into its `body_md`. The reverse holds on a database without the rewrite (local): `map` would rewrite this one post only. Hence `--rewrite` is now an explicit, required choice per target (Review fixes, item 2).
3. **Silent no-op on mixed-case / punctuated filenames (`legacyIdOf` mismatch)**:
   `mig6/lib.mjs` computes `legacyIdOf()` as raw path minus extension (`2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show`), whereas `mig1/import.mjs` computes `globId()` with `github-slugger` per path segment (`2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show`). Passing the unslugged ID to `mig1/import.mjs --match ... --match-exact` matches **0 posts** and exits 0 silently, dropping the update.
4. **Gallery additions ignored**:
   `mig6/catchup.mjs` diffs only `-- _docs`, completely missing `_gallery/11/25/beijing.json`.
5. **No `--base <sha>` / `--target <sha>` override**:
   `mig6/catchup.mjs` hardcodes `base = HEAD:src/content`, making it impossible to run against `testing` or `production` once `src/content` has been bumped on `feat/emdash`.

### Solution Added (`apps/web/scripts/import/mig7/`)

Without modifying `mig6/*` or `package.json` (`apps/web/vitest.config.ts` already includes `scripts/import/**/*.test.ts`):
- `apps/web/scripts/import/mig7/lib.mjs`: `parseContentDiff()` (both `_docs` and `_gallery`), `globLegacyId()` / `slugifySegment()` (matching `github-slugger@2.0.0`), `checkPostImages()` (MIG-2 `rewrite-map.json` + `upload-result.json` aware), and `checkGalleryImages()`.
- `apps/web/scripts/import/mig7/catchup.mjs`: CLI supporting `--base`, `--target`, `--ref`, `--dry-run`, `--write`, `--url`, `--rewrite map|none` (required with `--write`), `--yes-production`, `--force`, `--update-gallery`, `--bump`, and `--help`. Archives `_docs`, `_gallery`, and `generated/gallery.json` at `target`, runs `mig1/import.mjs --match <globLegacyId> --match-exact --rewrite=<mode>` for changed posts, and runs `mig3/import.mjs --only gallery` when gallery files changed.
- `apps/web/scripts/import/mig7/lib.test.ts`: Vitest unit suite covering all helpers and edge cases.

---

## 4. Environment Check & Dry-Run Evidence

- The first MIG-7 pass wrote nothing to any database. The local catch-up was run in the review-fix pass; results are under "Review fixes". Production has not been written.
- The dry-run outputs below are from the first pass (before `--rewrite` became required; the `rewrite` line now prints the explicit choice).

### Observed `mig6/catchup.mjs --dry-run` (reproducing the gap)

```text
ref origin/master
base   4893092b7beb40e7edf6b68205f8e649d18226a2
target 697380543aa357574a7c430ed952adf4a1ed0bda
added: 0
modified: 1
  2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md
images not on res.cloudinary.com (rehost first, nothing written):
  (20 http://ww1.sinaimg.cn/... URLs already uploaded in MIG-2)
EXIT=3
```

### Observed `mig7/catchup.mjs --dry-run` (delta since `MIG-6`: `4893092 -> 6973805`)

```text
ref    origin/master
base   4893092b7beb40e7edf6b68205f8e649d18226a2
target 697380543aa357574a7c430ed952adf4a1ed0bda
rewrite map
posts added: 0
posts modified: 1
  2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md
posts renamed: 0
posts deleted (report only, never removed): 0
gallery added: 1
  11/25/beijing.json
gallery modified: 0
gallery renamed: 0
gallery deleted (report only, never removed): 0
image guard: ok (posts: 1 direct Cloudinary, 20 MIG-2 rewritten; gallery: 1 direct Cloudinary)

plan (posts): import 1 post(s):
  2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show  <-- _docs/2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md

plan (gallery): import 1 gallery item(s):
  11/25/beijing (slug: 11-25-beijing)  <-- _gallery/11/25/beijing.json

dry run: nothing written. Add --write --url <admin> to import.
```

### Observed `mig7/catchup.mjs --dry-run --base b7d0c04` (full delta since pre-MIG-6 baseline: `b7d0c04 -> 6973805`)

```text
posts added: 1
  2026/11/25/gameplay-atlas.md
posts modified: 1
  2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md
gallery added: 1
  11/25/beijing.json
image guard: ok (posts: 48 direct Cloudinary, 20 MIG-2 rewritten; gallery: 1 direct Cloudinary)

plan (posts): import 2 post(s):
  2026/11/25/gameplay-atlas  <-- _docs/2026/11/25/gameplay-atlas.md
  2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show  <-- _docs/2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md

plan (gallery): import 1 gallery item(s):
  11/25/beijing (slug: 11-25-beijing)  <-- _gallery/11/25/beijing.json
```

---


## 5. Production Steps (owner only)

Agents never run these. Production is the single remote environment (INF-10 retired `testing`). The content delta is `4893092b -> 697380543` (one modified post, one new gallery item); `feat/emdash` already pins `src/content` at `697380543`, so no `--bump`.

No Cloudinary upload is needed: the cover and gallery image are already on `res.cloudinary.com/dmq8ipket`, and the 20 body images were uploaded by MIG-2.

### 5.1 Read-only checks: MIG-6 applied, and which `--rewrite`

From the repo root. `psql` with verified TLS (supabase.md "Connect"); the transaction is read-only and rolled back.

```bash
set -a; . ./.env; set +a          # loads SUPABASE_PRODUCTION_POOLER_URL; never echo it
PGSSLMODE=verify-full PGSSLROOTCERT=apps/web/scripts/certs/prod-ca-2021.crt \
psql "$SUPABASE_PRODUCTION_POOLER_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin transaction read only;
-- A. MIG-6 applied? expect one row: 2026-11-25-gameplay-atlas | published
select slug, status from ec_posts where slug = '2026-11-25-gameplay-atlas' and deleted_at is null;
-- B. rewrite mode: post bodies with legacy sinaimg URLs vs Cloudinary URLs
select count(*) filter (where body_md like '%sinaimg%')           as sinaimg_bodies,
       count(*) filter (where body_md like '%res.cloudinary.com%') as cloudinary_bodies,
       count(*)                                                     as posts
from ec_posts where deleted_at is null;
-- C. the post this catch-up rewrites
select featured_image is not null as has_cover,
       body_md like '%sinaimg%' as body_sinaimg,
       body_md like '%res.cloudinary.com%' as body_cloudinary
from ec_posts where slug = '2017-11-25-its-not-a-particularly-worthwhile-qin-and-han-show' and deleted_at is null;
-- D. gallery: expect 75 | 0 before the catch-up
select count(*) as gallery, count(*) filter (where slug = '11-25-beijing') as beijing
from ec_gallery where deleted_at is null;
rollback;
SQL
```

Decide:
- **A** returns the row: use `--base 4893092b`. No row: MIG-6 was not applied, use `--base b7d0c04` (also imports `gameplay-atlas`).
- **B/C**: about `4 | 377` with C `body_sinaimg = f`, `body_cloudinary = t` means the MIG-2 rewrite is there: use **`--rewrite map`** (expected). `32 | 242` with C `body_sinaimg = t` means no rewrite: use `--rewrite none` (or apply the full rewrite first, see runbooks/data.md "Catch-up (MIG-7)"). Anything else: stop and ask. (Reference: the 996 source posts give 32 / 242 raw and about 4 / 377 with every uploaded MIG-2 rewrite applied; the local DB shows exactly 32 / 242.)

### 5.2 Start the Docker admin against production

Not `pnpm admin:production`: SEC-07 refuses it without `--unsafe-dev-server` (dev bypass on the live DB). Follow [runbooks/admin-docker.md](../runbooks/admin-docker.md) §1, §3 and §6. `apps/admin/.env.production` (gitignored) needs `SITE_ENV=production`, `ADMIN_CONFIRM_PRODUCTION=yes`, `SUPABASE_PRODUCTION_REF=ckpozotzgubrjbjstvjg`, `DATABASE_URL` (production session pooler), `EMDASH_ENCRYPTION_KEY` (= `EMDASH_PRODUCTION_ENCRYPTION_KEY`), `EMDASH_SITE_URL=https://<admin host>`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, with `cloudflared` in front.

```bash
cd apps/admin
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production logs admin | grep "DB IDENTITY"   # must name the production pooler host
cd ../..
```

**How the catch-up reaches it.** The container listens on `0.0.0.0` with a production target, so Cloudflare Access is enforced inside it: `http://127.0.0.1:4322` answers 403 for `/_emdash/*`. The Node build also has no dev bypass. So the catch-up goes through the Access hostname with two credentials, which `mig1/import.mjs` and `mig3/rest.mjs` read from the environment (sent over https only):
- `EMDASH_HEADERS`: a Cloudflare Access **service token** (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) allowed by a Service Auth rule on the admin's Access application.
- `EMDASH_TOKEN`: an EmDash API token created in the admin (Settings -> API tokens). Revoke it afterwards.

```bash
read -rs CF_ID; read -rs CF_SECRET; read -rs EMDASH_TOKEN; export EMDASH_TOKEN
export EMDASH_HEADERS="$(printf 'CF-Access-Client-Id: %s\nCF-Access-Client-Secret: %s' "$CF_ID" "$CF_SECRET")"
ADMIN=https://<admin host>
```

### 5.3 Dry run, then write

```bash
git submodule update --init src/content          # 697380543
node apps/web/scripts/import/mig7/catchup.mjs --dry-run --rewrite map --url "$ADMIN" --base 4893092b --target 6973805
```
Expect: `admin <admin host> (REMOTE: production guard)`, posts modified 1, gallery added 1, `image guard: ok (posts: 1 direct Cloudinary, 20 MIG-2 hosted; gallery: 1 direct Cloudinary)`, `rewrite map: 20 MIG-2 hosted body URL(s) will be written as Cloudinary URLs`.

```bash
node apps/web/scripts/import/mig7/catchup.mjs --write --rewrite map --yes-production --url "$ADMIN" --base 4893092b --target 6973805
```
Expect: post `updated=1 failed=0`, `created gallery 11/25/beijing`, exit 0. (Use the `--base` and `--rewrite` that 5.1 chose. Without `--yes-production` the write refuses with exit 2.) Re-run the 5.1 query: C `t | f | t`, D `76 | 1`.

Then stop the admin and revoke the API token:
```bash
(cd apps/admin && docker compose --env-file .env.production down)
unset EMDASH_TOKEN EMDASH_HEADERS CF_ID CF_SECRET
```

### 5.4 Build, parity, deploy

```bash
pnpm deploy:production:build      # check-build-env + .env + derive (writes production's derived cache, as intended) + astro build
pnpm --filter web parity          # expect 0 missing
test -f apps/web/dist/client/api/gallery/trace/11-25-beijing.svg
test -f apps/web/dist/client/life/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/index.html
gh workflow run web-deploy.yml --ref feat/emdash -f environment=production
gh run list --workflow web-deploy.yml --limit 1
```
`deploy:production:build` refuses while `apps/web/.dev.vars` sets the Hyperdrive variable; move it aside for the build (admin.md "Safety"). The local build is verification only; CI deploys. `--ref feat/emdash` is needed because `web-deploy.yml` is not on `master` yet (checked 2026-11-26), so the nightly schedule and `repository_dispatch`, which use the default branch's workflows, do not run it.

---

## Review fixes (branch `emdash/MIG-7-fixes`)

1. **Local DB caught up.** Local admin (`pnpm admin:local -- --port 4333`, probe OK against `127.0.0.1:54322`), dry run then `catchup.mjs --write --rewrite none --url http://127.0.0.1:4333 --base 4893092b --target 6973805`: post `updated=1 failed=0`, `created gallery 11/25/beijing` (75 unchanged), exit 0.

   | Check (local) | Before | After |
   |---|---|---|
   | qin-han `featured_image` | NULL | `cloudinary`, id `growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796`, `f_auto,q_auto` src, alt `guanyin` |
   | qin-han `body_md` | 1627 chars, md5 `38614c16...`, sinaimg | unchanged (same md5); sha256 `5f3ba9da...` equals the source body at `697380543` |
   | `ec_gallery` (live) | 75, no `11-25-beijing` | 76; `11-25-beijing` published, doc `/2017/11/25/its-not-...`, hash `37619332...` |
   | post bodies sinaimg / cloudinary / rows | 32 / 242 / 999 | 32 / 242 / 999 (rewrite `none` keeps local consistent) |

   `pnpm --filter web derive` (local): 996 posts, 150 episodes, 76 gallery images (75 cached traces, 1 placeholder: derive no longer traces, PORT-8b), 1 cover colour extracted. `pnpm --filter web build` with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres`: exit 0. `pnpm --filter web parity`: 4945 expected, **0 missing**; extras include `/api/gallery/trace/11-25-beijing.svg` (new since the MIG-0 snapshot, so not in `legacy-urls.txt`) and 24 pre-existing `/api/cards` files. The qin-han page has the Cloudinary cover as `og:image`.
2. **`--rewrite` explicit.** No default any more: `--write` without `--rewrite map|none` exits 2, and the choice is printed. The image guard always consults the MIG-2 map, so `none` is accepted for MIG-2 hosted URLs (it prints how many stay legacy). Documented in runbooks/data.md "Catch-up (MIG-7)": local `none` (or the full `mig1 --rewrite=map` run), production `map` after the 5.1 count.
3. **Production steps rewritten** (§5): no testing step, Docker admin with Access service token + EmDash API token, `pnpm deploy:production:build`, `--base 4893092b` with the read-only check, dry run first. `pnpm db:start` exists (root `package.json`) and is not needed for production; it is no longer in §5.
4. **Production guard.** `catchup.mjs` prints `admin <host> (loopback|REMOTE: production guard)`; `--write` to any host other than `localhost`/`127.0.0.1`/`[::1]` exits 2 without `--yes-production` (userinfo URLs refused). Unit tests: `describeTarget`, `validateOptions`.
5. **`--bump` preconditions.** Checked before any write and again before moving the gitlink: `HEAD:src/content` and the submodule checkout must both equal `--base` and the submodule must be clean, else exit 2; both already at `--target` is a no-op. Unit tests: `bumpPreconditions`.
6. Stale "post-merge wiring note" and "local Supabase offline" claims removed.
7. `apps/web/tests/parity-allow-extra.txt` allows `/api/gallery/trace/11-25-beijing.svg`: `route-parity.test.ts` runs with `--fail-on-extra` and failed on the caught-up build because the new gallery item is not in the MIG-0 snapshot.

Checks on this branch: `pnpm --filter web exec vitest run` 42 files / 486 tests pass; `pnpm --filter web exec astro check` 0 errors, 0 warnings; root `pnpm test:unit` 34 files passed, 1 skipped (221 tests passed, 3 skipped).
