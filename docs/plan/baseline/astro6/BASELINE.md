# Astro 6 Baseline (captured 2026-09-21)

Branch: `astro7-upgrade` (baseline captured before any dependency changes)
Astro version: `6.3.8`

## Build metrics

| Metric                                                            | Value                                          |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `pnpm build` wall-clock (astro check + astro build + resume PDFs) | ~3m 20s (astro build alone: 3m 8s, 1617 pages) |
| `astro check`                                                     | 0 errors, 0 warnings, 64 hints (212 files)     |
| `du -sh dist/`                                                    | 326 MB                                         |
| `du -sh dist/_astro/`                                             | 49 MB                                          |

### Largest files under `dist/_astro/`

| Size   | File                                        |
| ------ | ------------------------------------------- |
| 2.5 MB | `dalian-subway-5-573.BTK_Iud8_Z1VoF0l.webp` |
| 2.5 MB | `MantineHero.C9xfFLuM.js`                   |
| 1.3 MB | `selfie.VcPlgrTl.png`                       |
| 1.2 MB | `nsfw.CaU0sI72.png`                         |
| 1.1 MB | `selfie.BtVU_0Vr.jpg`                       |
| 1.1 MB | `maplibre-gl.BaAEkp-v.js`                   |
| 892 KB | `zhenjiang.D6JXe3CX.jpg`                    |
| 888 KB | `thailand.D0chagL0.jpg`                     |
| 780 KB | `macaw.BnsIe6Fy.jpg`                        |
| 668 KB | `three.module.4_GyyqrB.js`                  |

## Test results

- `pnpm test:unit` (excludes `.test.tsx`): **GREEN** — 28 files passed, 1 skipped; 164 passed, 3 skipped.
- `pnpm test` (full, includes jsdom component tests): 19 failures across 4 files
  (`BlogCarousel.test.tsx`, `PodcastEpisodeCard.test.tsx`, `PostCard.test.tsx`,
  `BlogContent.test.tsx`). These are **pre-existing on Astro 6** (jsdom/Mantine
  render issues), not caused by the upgrade. Verified identical state on `master`.
  Treat these as the baseline; do not fix as part of the Astro 7 upgrade.

## Saved artifacts (in `docs/plan/baseline/astro6/`)

- `rss.xml` — copy of `dist/rss.xml`
- `sitemap-index.xml` — copy of `dist/sitemap-index.xml`
- `html/homepage.html` — homepage
- `html/post-katex.html` — post with KaTeX/math (`tech/2021/02/09/latex-cheat-sheet`)
- `html/post-mermaid.html` — post with Mermaid + code blocks (`fe/2025/09/08/mermaid`)
- `html/post-plantuml.html` — post with PlantUML + code blocks (`fe/2017/12/20/plantuml`)
- `html/post-tetris-ai.html` — MDX post (`fe/2025/09/09/tetris-ai`)
- `html/mdx-blog-cards.html` — MDX page (`fe/2025/08/18/blog-cards`)
- `html/mdx-puzzle-game.html` — MDX page (`fe/2025/02/21/puzzle-game`)
- `html/cv.html` — resume page
- `html/about.html` — about page
- `html/hero-gallery.html` — gallery page

## Content pipeline sanity (grep counts in saved HTML)

| Page               | katex | mermaid | plantuml | astro-code blocks |
| ------------------ | ----- | ------- | -------- | ----------------- |
| post-katex.html    | 18    | 0       | 0        | 12                |
| post-mermaid.html  | 0     | 14      | 2        | 3                 |
| post-plantuml.html | 0     | 0       | 15       | 5                 |

- Cloudinary rewriting confirmed working (`res.cloudinary.com/.../f_auto,q_50,w_96/...` in resume pages).
- RSS + sitemap-index present in `dist/`.

## Screenshots

Not captured (no browser automation wired in this session). The saved
full-page HTML files above serve as the visual reference baseline for the
Step 8 whitespace audit; screenshots can be regenerated from them or via
`pnpm preview` on this commit (`78d4ab1`) if pixel comparison is needed.

## Baseline commit

`78d4ab1` (`doc: upgrade plan`) on branch `astro7-upgrade`.
