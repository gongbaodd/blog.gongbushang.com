# Resume (bilingual CVs)

Eight CV focuses × two languages = sixteen static pages + sixteen PDFs.

| Focus | Role key | EN page | ZH page |
|---|---|---|---|
| Universal | `universal` | `/resume` | `/resume/universal/zh` |
| Full-Stack Dev | `full-stack` | `/resume/full-stack/en` | `/resume/full-stack/zh` |
| Machine Learning | `machine-learning` | `/resume/machine-learning/en` | `/resume/machine-learning/zh` |
| DevOps | `devops` | `/resume/devops/en` | `/resume/devops/zh` |
| Game Dev | `game-dev` | `/resume/game-dev/en` | `/resume/game-dev/zh` |
| AI Agent | `ai-agent` | `/resume/ai-agent/en` | `/resume/ai-agent/zh` |
| Product Engineer | `product-engineer` | `/resume/product-engineer/en` | `/resume/product-engineer/zh` |
| QA Tester | `qa-tester` | `/resume/qa-tester/en` | `/resume/qa-tester/zh` |

PDFs: `/resume/pdfs/jian-gong-<role>-<language>.pdf` (max 2 MB each, 1 A4 page).

## Where to edit

- Facts + translations: `packages/resume/data.ts`
  - `profile` — name, email, links, location, languages.
  - `education` / `experience` / `projects` — keyed records; each has `{ en, zh }` for `name`, `detail`, `date`, `award`. Keep claims aligned with the source CV; images are Cloudinary URLs (optimized in `MantineResume.tsx`: `f_auto,q_50,w_128` logos, `f_auto,q_40,w_320` covers — keeps PDFs under 2 MB).
  - `labels` — UI strings (`skills`, `education`, `print`, `download`, …) per language.
  - `roleLabels` — focus names per language.
  - `updated` — bump the `Last updated / 更新日期` stamp (single source; shown on every CV).
- Chinese font: after changing any CV wording, regenerate the self-hosted
  subsets (new glyphs need new subset files, which are committed):
  `python3 packages/resume/subset-fonts.py` → `public/fonts/resume-noto-sans-{sc,thai}-{400,700}.woff2`.
  Latin weights come from `@fontsource/noto-sans-sc` (npm).
- Role selections: `variants` in `packages/resume/data.ts` — per role: `headline`, `summary` (one professional summary each), `skills`, and ordered `education` / `experience` / `project` ID lists. Experience entries carry tech-stack `tags` rendered as badges.
- Layout: `packages/resume/MantineResume.tsx` + `MantineResume.module.css` (single A4 page in the site's Mantine idiom — cards, gray badges, `#1c7ed6` accents, system font stack + bundled CJK/Thai: header, then experience + projects in the main column, skills/education/languages in the rail). The project grid renders uniform fixed-design cards (3 columns, or 2 for 6-project variants so every CV shows full rows); rows spread evenly to fill the page without clipping. Print rules: `packages/resume/styles/paper.css` + sidebar/chrome print-hiding in `Resume.astro`.
- Page shell (sidebar, fonts): `packages/resume/Resume.astro` — CV/language selectors are plain `<a>` links in a sidebar (no client state), Download links straight to the selected PDF, Print calls `window.print()`. The sidebar stacks into a horizontal strip under 900 px and is hidden in print.
- Routes: `src/pages/resume.astro` (Universal EN) + `src/pages/resume/[role]/[lang].astro` (`getStaticPaths` for the other fifteen).
- Chinese font: self-hosted subsets in `public/fonts/` (see above) + `@fontsource/noto-sans-sc` latin 400/700 (npm); `font-family` stack in `MantineResume.module.css`.
- PDF generator: `packages/resume/generate-pdfs.mjs` (runs after `astro build`, uses headless Chromium, checks 1 page / ≤2 MB / no clipped `.sheet` / translated name present).

## Commands

```bash
pnpm build            # astro check + astro build + all 16 PDFs into dist/resume/pdfs/
pnpm resume:pdfs      # regenerate PDFs from an existing dist/ (requires a build first)
```

## Publishing

Content changes ship via site build. Edit `data.ts`, run `pnpm build`, verify pages + PDFs, commit.
