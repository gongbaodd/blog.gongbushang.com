# PORT-2: post page with legacy URLs (Builder-Core)

Branch `emdash/PORT-2` (from `feat/emdash`). Plan §4 E4, D5, D8; features F2, F10-F12.

## What was built
- `src/pages/[category]/[year]/[month]/[day]/[slug].astro` (`prerender = true`). `getStaticPaths` pages through `getEmDashCollection("posts")` (limit 100 + `nextCursor`; verified with limit 2), maps `legacy_id` (`YYYY/MM/DD/slug`) + the `category` term slug to params. Entries without `legacy_id` (starter posts) are skipped; a legacy post without a category term throws.
- Body: `renderMarkdown(body_md)` (S0-4 pipeline). Headings feed the TOC. **Title/H1 = first heading of the body** (legacy `extract.ts` rule), then the EmDash `title`, then the slug with dashes as spaces. Excerpt = legacy rule (strip markdown, 120 chars + `...`) via `remark` + `strip-markdown` (two new build-only deps).
- `src/lib/content.ts`: `mapPost`, `getAllPosts`, `postTitle`, `quickTitle`, `postExcerpt`, `postLinks`, `seriesNav`. Mapped shape mirrors the legacy collection entry (`id`, `body`, `data.{type,category,adsense,tag,series{slug,name,number},cover{url,alt},city}`); `date` is the timezone-free `legacy_date`. Cover = `featured_image.src` through `optimizeCoverUrl` (`f_auto,q_auto`). `type` comes from `legacy_frontmatter_extra`.
- `src/lib/legacy-url.ts`: pure URL mapping (`postParams`, `postPath`, `parsePostPath`, hrefs). Tag hrefs are `encodeURIComponent`-ed (`/tag/c%23`; legacy emitted `/tag/c#`, a fragment).
- Layout `src/layouts/BlogPost.astro` + `src/components/{BlogContent,MantineMain,GridWithMenu}`: header badges (category, tags, series, cities), date, reading time, cover card, TOC (Headings), series card with prev/next (ordered by `series_number`, then date), KaTeX CSS, AdSense head/slot (stubs, PORT-7), Footer with the ViewCount island, `data-post-read` attributes kept, `#related-posts` placeholder in the sidebar (PORT-6). The `post_read` scroll script is NOT ported (needs `track()` from PORT-7); TODO left in the layout.
- `.mdx`: the 3 files (`puzzle-game`, `blog-cards`, `tetris-ai`) only use `<DescriptionImage src alt [mah]>` plus its import. `src/lib/mdx-lite.ts` rewrites it to plain HTML at render time (dedents children, `f_auto,q_auto` on `src`), so no MDX dependency. Anything else JSX would log a warning (none in the build).
- `/spike/**` deleted (S0 proofs live in the S0 reports; nothing imported them). `index.astro` post links now use `mapPost(...).href`.
- Dev seeding: `scripts/dev/seed-sample-posts.mjs` (real legacy ids via CLI/REST, `legacy_frontmatter_extra.seeded_by` marker, idempotent). I seeded 6 posts (mermaid, plantuml, matrix = series + KaTeX, bohai-rim = 7 cities, blog-cards = mdx + series, puzzle-game = cover + iframe). MIG-1 finished its local import (995 posts) in parallel and overwrote them; the final build and parity checks ran on the real import.

## Verification (run from the worktree)
- `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --filter web build` -> exit 0 (static-route guard passes), ~37 s for 995 post pages. No warnings from our code.
- Built `index.html` paths: 996, **0 outside `legacy-urls.txt`**; all 995 legacy post paths built (none missing). `dist/client`: 1,291 files, 162 MB (free tier 20,000 files).
- `pnpm --filter web exec vitest run`: 4 files, 29 tests pass. New `src/lib/legacy-url.test.ts`: all 995 post paths in `legacy-urls.txt` round-trip (path -> legacy_id + category -> params -> path), malformed ids, `mapPost`, title rule, MDX rewrite.
- `pnpm --filter web exec astro check`: 0 errors, 0 warnings, 7 hints (pre-existing).
- Dev servers stopped (`astro dev stop`).

## Parity (new `apps/web/dist/client/<url>/index.html` vs legacy `dist/<url>/index.html`)
Tool (since replaced by `scripts/import/mig4/diff.mjs`; the old `scripts/dev/parity-post.cjs` was deleted) (jsdom: `<title>`, h1, meta description, canonical, post-body text, headings with ids, links, img src, counts of `.katex` / `pre.mermaid` / `pre.astro-code` / iframes / tables). Sample: every 12th legacy post (82) + 6 named (mermaid, plantuml, matrix, bohai-rim, blog-cards, puzzle-game, tetris-ai) = 88 posts.

Identical on all 88: title, h1, description, canonical, headings (incl. ids), links. Differences:
| Post(s) | Diff | Cause / status |
|---|---|---|
| `life/2020/07/19/study-surfing-in-houhai-sanya`, `sport/2016/08/13/conquest-line-10` (and the 271 refs of that kind) | img src `./portal.jpg` vs legacy `/_astro/portal.*.webp` | Local images are not yet rehosted; MIG-2's upload + `rewrite-map.json` rewrite them to Cloudinary (49 posts with `](./` in `body_md` now). Pending the owner-approved upload |
| `fe/2025/08/18/blog-cards`, `fe/2025/09/09/tetris-ai` | text differs | Legacy page text contains an inlined Mantine `SimpleGrid` `<style>` string (CSS in `textContent`); ours is clean. Not content |
| `fe/2025/09/09/tetris-ai` | 8 vs 7 `pre.astro-code`; apostrophes curly (`you’re`) | 1 extra `plaintext` code block (cause not pinned down; MDX vs markdown parsing of a fence) and curly apostrophes (smartypants in markdown). Cosmetic; found 3 extra blocks and an image-optimisation gap first, fixed by dedenting the `DescriptionImage` children and optimizing its `src` |
| series / tag / city badge order | tag order alphabetical (EmDash term order) vs frontmatter order in legacy | EmDash does not keep per-entry term order. Content identical; only badge order |
| Post pages with cities / series | extra badges for city (`/world/<slug>`) and a series card in the menu | Intended additions (task requirement) |
| `og:image` | legacy fell back to `/blog-placeholder-1.jpg` (404 in legacy too); ours uses the cover when present, else `EmDashHead` default | improvement |

## Notes for others
- MIG-1: `getAllPosts` requires a `category` term on every post with a `legacy_id`; `quickTitle`/title use the first heading, so the stored `title` is only a fallback. Tags use `term.slug` (lowercased) as label like legacy; `series` label = display name, `series_number` from the field.
- PORT-3 will port `PostCard` and can replace the simplified cover card in `BlogMenu`.
- PORT-6: mount the related-posts island into `#related-posts` (layout `<aside slot="sidebarNode">`). PORT-7: `post_read` script, AdSense slot/head, `track()`.
- Gantt: PORT-2 marked `active`; mark `done` after merge.
- Open: `ViewCount` still calls `pv.growgen.xyz` (PORT-1 question 1). Pages under `/[category]/…` use a dynamic first segment; a static `/<word>/` route added later must not collide with category slugs (`fe`, `tech`, `life`, ...).
