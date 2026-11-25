# MIG-7: Sync New Content Updates from `master` into EmDash (GON-192)

- **Date**: 2026-11-25
- **Branch**: `emdash/MIG-7-master-sync` (based on `feat/emdash` `71a0949`)
- **Status**: Content fetched, inventoried, gaps fixed in `apps/web/scripts/import/mig7/`, `src/content` gitlink bumped to `697380543`; **no database writes performed** (local Supabase offline; testing/production require explicit owner execution).

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
   `mig6/catchup.mjs` invokes `mig1/import.mjs` without `--rewrite=map`. Even if the image guard passed, re-importing `It's-not-a-particularly-worthwhile-Qin-and-Han-show.md` with `--rewrite=none` would overwrite its Cloudinary-rewritten `body_md` in EmDash back to hotlink-gated `http://ww1.sinaimg.cn/...` URLs. Passing `--rewrite=map` preserves all 20 MIG-2 rewrites while remaining a no-op for brand-new Cloudinary-native posts like `gameplay-atlas.md`.
3. **Silent no-op on mixed-case / punctuated filenames (`legacyIdOf` mismatch)**:
   `mig6/lib.mjs` computes `legacyIdOf()` as raw path minus extension (`2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show`), whereas `mig1/import.mjs` computes `globId()` with `github-slugger` per path segment (`2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show`). Passing the unslugged ID to `mig1/import.mjs --match ... --match-exact` matches **0 posts** and exits 0 silently, dropping the update.
4. **Gallery additions ignored**:
   `mig6/catchup.mjs` diffs only `-- _docs`, completely missing `_gallery/11/25/beijing.json`.
5. **No `--base <sha>` / `--target <sha>` override**:
   `mig6/catchup.mjs` hardcodes `base = HEAD:src/content`, making it impossible to run against `testing` or `production` once `src/content` has been bumped on `feat/emdash`.

### Solution Added (`apps/web/scripts/import/mig7/`)

Without modifying `mig6/*`, `package.json`, or `vitest.config.ts`:
- `apps/web/scripts/import/mig7/lib.mjs`: `parseContentDiff()` (both `_docs` and `_gallery`), `globLegacyId()` / `slugifySegment()` (matching `github-slugger@2.0.0`), `checkPostImages()` (MIG-2 `rewrite-map.json` + `upload-result.json` aware), and `checkGalleryImages()`.
- `apps/web/scripts/import/mig7/catchup.mjs`: CLI supporting `--base`, `--target`, `--ref`, `--dry-run`, `--write`, `--url`, `--rewrite=map|none` (defaults to `map`), `--force`, `--update-gallery`, `--bump`, and `--help`. Archives `_docs`, `_gallery`, and `generated/gallery.json` at `target`, runs `mig1/import.mjs --match <globLegacyId> --match-exact --rewrite=map` for changed posts, and runs `mig3/import.mjs --only gallery` when gallery files changed.
- `apps/web/scripts/import/mig7/lib.test.ts`: Vitest unit suite covering all helpers and edge cases. *(Post-merge wiring note: add `"scripts/import/mig7/*.test.ts"` to `apps/web/vitest.config.ts` `include`.)*

---

## 4. Environment Check & Dry-Run Evidence

- **Local Supabase (`127.0.0.1:54322`)**: unreachable (`LOCAL_DB_DOWN`).
- **Local EmDash Admin (`127.0.0.1:4322` / `4332`)**: unreachable (`LOCAL_ADMIN_DOWN`).
- **No database writes executed** on `local`, `testing`, or `production`.

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

## 5. Exact Copy-Paste Execution Commands

### Step 0: External Image Rehosting

**No Cloudinary upload is needed for `b7d0c04 -> 6973805`.** All 48 direct Cloudinary URLs and all 20 MIG-2 rewritten URLs are already live on `res.cloudinary.com/dmq8ipket`.

*(If future `master` commits add unhosted external/local images, `mig7/catchup.mjs` exits `3` with the list. Rehost them first via the MIG-2 pipeline before re-running catch-up: `node apps/web/scripts/import/mig2/inventory.mjs && node apps/web/scripts/import/mig2/download.mjs && node apps/web/scripts/import/mig2/plan.mjs && node apps/web/scripts/import/mig2/upload.mjs --execute`.)*

> **Choosing `--base`**:
> - Use `--base 4893092` if that environment already imported `MIG-6` (`gameplay-atlas`).
> - Use `--base b7d0c04` if that environment is still at the initial `MIG-1`/`MIG-3` import baseline (idempotent: re-importing `gameplay-atlas` if already present simply reports `unchanged`).

### Step 1: Local (`127.0.0.1:54322`)

```bash
# Ensure submodule is at 6973805 and local Postgres + admin are running
git submodule update --init src/content
pnpm db:start
pnpm admin:local

# 1. Dry-run first (use --base b7d0c04 to safely cover both MIG-6 and MIG-7)
node apps/web/scripts/import/mig7/catchup.mjs --dry-run --base b7d0c04 --target 6973805

# 2. Import posts (with --rewrite=map) + new gallery item (11/25/beijing)
node apps/web/scripts/import/mig7/catchup.mjs --write --url http://127.0.0.1:4322 --base b7d0c04 --target 6973805

# 3. Refresh derived caches (embeddings, UMAP, cover colors, gallery traces), build, and verify URL parity
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
pnpm --filter web derive
pnpm --filter web build
node apps/web/tests/check-parity.mjs --dir apps/web/dist/client --all

# 4. Spot-check the two affected post pages and gallery count in the build output
test -f apps/web/dist/client/fe/2026/11/25/gameplay-atlas/index.html
test -f apps/web/dist/client/life/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/index.html
test -f apps/web/dist/client/api/gallery/trace/11-25-beijing.svg

# 5. Stop local admin
pnpm admin:stop
```

### Step 2: Testing (`SUPABASE_TESTING_POOLER_URL`)

```bash
# Load repo-root .env into the current shell (never echo secret values)
set -a; . ./.env; set +a
pnpm admin:testing

# 1. Dry-run and write catch-up (covers both 4893092 gameplay-atlas and 6973805 beijing)
node apps/web/scripts/import/mig7/catchup.mjs --dry-run --base b7d0c04 --target 6973805
node apps/web/scripts/import/mig7/catchup.mjs --write --url http://127.0.0.1:4322 --base b7d0c04 --target 6973805

# 2. Refresh derived schema on testing DB, build for testing, and verify URL parity
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_TESTING_POOLER_URL" pnpm --filter web derive
pnpm deploy:testing:build
node apps/web/tests/check-parity.mjs --dir apps/web/dist/client --all

# 3. Stop testing admin
pnpm admin:stop
```

### Step 3: Production (`SUPABASE_PRODUCTION_POOLER_URL` — Owner Confirmation Required)

> **WARNING**: Run ONLY after testing verification passes and the owner approves writing to production.

```bash
# Load repo-root .env into the current shell (never echo secret values)
set -a; . ./.env; set +a
pnpm admin:production -- --yes-production

# 1. Dry-run and write catch-up against production admin
node apps/web/scripts/import/mig7/catchup.mjs --dry-run --base b7d0c04 --target 6973805
node apps/web/scripts/import/mig7/catchup.mjs --write --url http://127.0.0.1:4322 --base b7d0c04 --target 6973805

# 2. Refresh derived schema on production DB, build, and verify URL parity
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_PRODUCTION_POOLER_URL" pnpm --filter web derive
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$SUPABASE_PRODUCTION_POOLER_URL" pnpm --filter web build
node apps/web/tests/check-parity.mjs --dir apps/web/dist/client --all

# 3. Stop production admin
pnpm admin:stop
```

*(Note: If any post was manually edited in the EmDash admin since the last import, `mig1/import.mjs`'s overwrite guard will skip it (`skipped-edited`). Inspect the diff in admin before passing `--force`.)*
