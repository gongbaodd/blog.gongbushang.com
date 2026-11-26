# MIG-0 report: legacy snapshot and audit

Generated 2026-11-24 by `apps/web/scripts/import/mig0/snapshot.mjs` and `audit.mjs`. Source: `/Volumes/MacData/github/blog.gongbushang.com` (legacy `dist/` built today, `src/content/_docs`).

## 1. Totals per route group

Snapshot file: `apps/web/tests/legacy-urls.txt` and `legacy-route-groups.json`. Route groups are assigned from the URL shape (see `classify()` in snapshot.mjs).

| Group | Paths |
|---|---|
| other | 2 |
| static | 36 |
| category | 10 |
| api/* | 3080 |
| post | 995 |
| resume | 38 |
| gallery | 1 |
| podcast | 151 |
| rss/sitemap | 4 |
| series | 26 |
| tag | 433 |
| world | 156 |
| year | 13 |

Total paths: 4945. The 18 CV PDFs under `/resume/pdfs/` are not in `dist/` (generate-pdfs.mjs has not run) and are added from the script's role/language list. `dist/resume/pdfs/` holds only `.gitkeep`.

## 2. Posts

- Source markdown files: 995; non-markdown assets under `_docs`: 278.
- Posts (markdown): 995. With a dist URL at `/<category>/<id>/`: 995. Missing: 0.
- Dist post pages with no source post: 0.
- Legacy `type` values: `"post"` x991, `"draft"` x4. Values other than `post` and `draft`: none. Values with stray whitespace are YAML-trimmed to `post`.
- Frontmatter keys outside the collection schema: {"plan":1}.
- `{"file":"2024/03/30/week-13-3-body-Steroids.md","key":"plan","value":"3 body,steroids,LLama,MediaPipe,WTF Academy,Edge Impulse,solidity"}`
- Posts without `category`: 0.
- Frontmatter parse errors: 0. Files without frontmatter: 0. Folder not `YYYY/MM/DD`: 0.

## 3. Draft audit (`type: draft`)

4 posts have `type: draft`. Each one has a dist page, so the draft is public today. `packages/utils/post.ts` has no draft filter.

- `2019/02/24/Grass-list.md` -> `/life/2019/02/24/grass-list/` (dist: yes)
- `2026/02/12/munchen.md` -> `/life/2026/02/12/munchen/` (dist: yes)
- `2026/02/14/prague.md` -> `/life/2026/02/14/prague/` (dist: yes)
- `2026/02/16/krakow.md` -> `/life/2026/02/16/krakow/` (dist: yes)

## 4. Slug collisions and glob ids

- Duplicate glob ids (same `/YYYY/MM/DD/slug`): 0.
- Same slug tail under different dates: 26 groups. These do not collide in URLs because the date is in the path. Examples:
  - `threejs`: 2015/03/15, 2020/04/27
  - `chrome`: 2016/01/25, 2026/05/26
  - `archlinux`: 2016/11/09, 2017/12/08
  - `6`: 2017/05/04, 2018/07/05, 2020/06/01
  - `13`: 2017/09/17, 2019/12/26
  - `webpack`: 2018/02/07, 2019/09/04
  - `git`: 2018/02/27, 2026/04/04
  - `18`: 2018/03/04, 2018/12/01, 2018/12/24
  - `7`: 2018/08/04, 2019/07/14, 2020/07/27
  - `css`: 2018/12/25, 2019/03/30, 2020/04/16
- Glob id differs from the lowercase file name: 78. Examples (file -> glob slug vs lowercased name):
  - `2015/03/15/THREE.JS.md` -> `threejs` vs `three.js`
  - `2015/03/21/Don't Starve console.md` -> `dont-starve-console` vs `don't starve console`
  - `2015/05/09/ionic-Todo guide.md` -> `ionic-todo-guide` vs `ionic-todo guide`
  - `2015/08/25/fekit extension.md` -> `fekit-extension` vs `fekit extension`
  - `2016/09/06/sonic.js-loading.md` -> `sonicjs-loading` vs `sonic.js-loading`
  - `2016/09/25/Tang-Fan-Beidou-Xi'an-Chapter.md` -> `tang-fan-beidou-xian-chapter` vs `tang-fan-beidou-xi'an-chapter`
  - `2016/10/29/Quiet-Echo-Wall-and-the-former-residence-of-the-Siye-Earth-Altar-·-Yonghe-Palace.md` -> `quiet-echo-wall-and-the-former-residence-of-the-siye-earth-altar--yonghe-palace` vs `quiet-echo-wall-and-the-former-residence-of-the-siye-earth-altar-·-yonghe-palace`
  - `2017/01/17/VScode-Python-python3.6.md` -> `vscode-python-python36` vs `vscode-python-python3.6`
  - `2017/03/18/Looking-at-the-east,-the-National-British-British-Hundred-Cultural-Relics-Exhibition.md` -> `looking-at-the-east-the-national-british-british-hundred-cultural-relics-exhibition` vs `looking-at-the-east,-the-national-british-british-hundred-cultural-relics-exhibition`
  - `2017/07/30/Different-meal+founding-of-the-army.md` -> `different-mealfounding-of-the-army` vs `different-meal+founding-of-the-army`
- ... 38 more (see the audit script)

## 5. Taxonomy slugs

Rules read from the legacy code: categories use the raw value (`packages/utils/filter.ts`), tags are lowercased, series use `series.slug`, cities use `citySlug()` (`packages/utils/city.ts`). Dist directories are named with percent-encoding (for example `tag/c%23/`).

### category

Distinct values: 9. Missing in dist: 0.

Mixed-case raw values: 0.

Samples (raw value -> dist URL):
- `music` -> `/music/` (2 posts)
- `fe` -> `/fe/` (179 posts)
- `tech` -> `/tech/` (207 posts)
- `life` -> `/life/` (255 posts)
- `sport` -> `/sport/` (4 posts)
- `book` -> `/book/` (77 posts)
- `plan` -> `/plan/` (187 posts)
- `movie` -> `/movie/` (67 posts)
- `tv` -> `/tv/` (17 posts)

### tag

Distinct values: 472. Missing in dist: 0.

Mixed-case raw values: 174.

Samples (raw value -> dist URL):
- `Pebble` -> `/tag/pebble/` (1 posts)
- `vim` -> `/tag/vim/` (2 posts)
- `linux` -> `/tag/linux/` (2 posts)
- `windows` -> `/tag/windows/` (11 posts)
- `raspberrypi` -> `/tag/raspberrypi/` (1 posts)
- `portfolio` -> `/tag/portfolio/` (35 posts)
- `harmonica` -> `/tag/harmonica/` (1 posts)
- `photography` -> `/tag/photography/` (1 posts)
- `aframe.js` -> `/tag/aframe.js/` (1 posts)
- `ECS` -> `/tag/ecs/` (7 posts)
- `voxel` -> `/tag/voxel/` (3 posts)
- `3d` -> `/tag/3d/` (1 posts)
- `keeweb` -> `/tag/keeweb/` (1 posts)
- `windows-terminal` -> `/tag/windows-terminal/` (1 posts)
- `test` -> `/tag/test/` (2 posts)

### series

Distinct values: 26. Missing in dist: 0.

Mixed-case raw values: 4.

Samples (raw value -> dist URL):
- `windows-howto` -> `/series/windows-howto/` (18 posts)
- `threejs-howto` -> `/series/threejs-howto/` (3 posts)
- `tools` -> `/series/tools/` (2 posts)
- `Flutter-for-RN-devs` -> `/series/Flutter-for-RN-devs/` (5 posts)
- `learn-tensorflow` -> `/series/learn-tensorflow/` (5 posts)
- `linear` -> `/series/linear/` (25 posts)
- `computer` -> `/series/computer/` (1 posts)
- `math` -> `/series/math/` (16 posts)
- `CSAPP` -> `/series/CSAPP/` (3 posts)
- `probability` -> `/series/probability/` (4 posts)
- `2023-plan` -> `/series/2023-plan/` (49 posts)
- `2024-plan` -> `/series/2024-plan/` (52 posts)
- `2025-plan` -> `/series/2025-plan/` (45 posts)
- `vibe-coding` -> `/series/vibe-coding/` (4 posts)
- `website-rebuild` -> `/series/website-rebuild/` (13 posts)

### city

Distinct values: 155. Missing in dist: 0.

Mixed-case raw values: 155.

Samples (raw value -> dist URL):
- `Yantai, China` -> `/world/yantai-china/` (1 posts)
- `Penglai, China` -> `/world/penglai-china/` (1 posts)
- `Qingdao, China` -> `/world/qingdao-china/` (1 posts)
- `Tai'an, China` -> `/world/tai-an-china/` (1 posts)
- `Qufu, China` -> `/world/qufu-china/` (1 posts)
- `Jinan, China` -> `/world/jinan-china/` (1 posts)
- `Tianjin, China` -> `/world/tianjin-china/` (2 posts)
- `Dalian, China` -> `/world/dalian-china/` (9 posts)
- `Sanya, China` -> `/world/sanya-china/` (7 posts)
- `Chengde, China` -> `/world/chengde-china/` (1 posts)
- `Beijing, China` -> `/world/beijing-china/` (27 posts)
- `Datong, China` -> `/world/datong-china/` (4 posts)
- `Pingyao, China` -> `/world/pingyao-china/` (2 posts)
- `Linfen, China` -> `/world/linfen-china/` (2 posts)
- `Huashan, China` -> `/world/huashan-china/` (2 posts)

## 6. Timezone check

Post dates come from the glob id and are built with local `new Date(y, m-1, d)`, so no URL can shift.
- Dist URL date differs from folder date: 0.
- Rendered page lacks its folder date (`YYYY-MM-DD`): 0.

## 7. Trailing slash and non-index files

- Directory pages are written as `index.html` and served at `/path/`. The legacy build has no `trailingSlash` override (astro.config.mjs sets only `site`), so the default `directory` format applies.
- Non-index HTML files in dist: `/404.html`.
- Files other than `index.html` are listed as-is (for example `/rss.xml`, `/api/.../1.ndjson`, `/sitemap-0.xml`).

## 8. Open questions for Lead

Nothing here is fixed by the migrator. Items for a decision:
- Drafts are public in the legacy site (section 3). Keep them public in EmDash, or hide them with `draft` status?
- Post count: 995 markdown files in `_docs`, against 994 in the brief. The extra file is not identified here; Lead to confirm the expected count.
- Legacy glob ids drop characters such as apostrophes, `+` and `.`, and turn `·` into `--` (section 4). EmDash `legacy_slug` keeps these ids as produced, so the URLs match. Confirm this is the intended rule.
- Frontmatter key `plan` (section 2) is outside the schema. Lead to decide whether it is data to keep.
