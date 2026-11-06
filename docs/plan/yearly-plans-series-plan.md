# Yearly "Plans" Series Plan

> Created: 2026-11-06\
> Status: **DONE (2026-11-06)** — applied with option A (skip existing series) and name `YYYY plans`. 182 posts tagged (2023: 49, 2024: 52, 2025: 45, 2026: 36); 16 skipped. `astro check` 0 errors. Not yet committed; dev-server check of `/series/2026-plan` not done.\
> Scope: add a per-year `series` to the old weekly-plan posts in `src/content/_docs`.

## Goal

The posts titled "Week N: ..." started as weekly plans, but now span many
categories (`plan`, `fe`, `tech`, `life`, `tv`). Group them into one series
per year so they show up under `/series/<year>-plan`.

Example: `src/content/_docs/2026/11/03/glb.md` gets

```yaml
series:
  name: 2026 plans
  slug: 2026-plan
```

## Findings

- "Title" is the first H1 in the body, not frontmatter. My first pass only
  matched `# Week N` and undercounted (about 144). Real H1 variants:
  `# 5th week: ...`, `# the 7th week`, `# The First Week`, `# Week2:`,
  `# 🚀 Week 45: ...`, `# WEEK 34`, plus a few whose H1 has no "week" but the
  filename does (`week-17-PWA.md`, `week-33-website-rebuild.md`).
- Matching rule (case-insensitive, on the first `# ` line, after skipping
  leading emoji/symbols): `week <n>`, `<n>th/st/nd/rd/tn week`, `first/forth week`;
  OR filename matches `week-?<n>`. Yearly retrospectives (`# 2023 Retrospective`)
  are **not** included.
- Resulting counts by directory year:

  | Year | Posts | Note                          |
  | ---- | ----- | ----------------------------- |
  | 2023 | 49    | a few duplicate week numbers  |
  | 2024 | 52    | full year                     |
  | 2025 | 52    | full year                     |
  | 2026 | 45    | week 0 to week 44 so far      |

- Other posts in the same years (travel, drone, tutorials) are not weekly
  posts and are left alone.
- `series` in `src/content.config.ts` is a **single object**
  (`slug`, optional `name`, optional `number`). A post can have only one.
- **16 matched posts already have a series** and would be overwritten:
  - 2025 (7): `vibe-coding` (week-12), `website-rebuild` (week-33, week-34,
    goatcounter, week-38), `3d-printing` (week-41, week-43)
  - 2026 (9): `master` (week-14-xr, thesis), `grandpa-bee`
    (unity-localization, bdd, perf, best-gameplay, remotion), `figma`
    (figma, figma-2)
- `/series/[filter]` and the series label come from `series.slug` /
  `series.name` (`packages/utils/filter.ts`, `extract.ts`), so no code
  change is needed for new slugs.
- `src/content` is a git submodule: edits are committed in the submodule
  first, then the pointer is bumped in this repo.

## Open decisions (need your answer)

1. **Name format.** Your text says name `${year} plans`, but the example says
   `"2026-plans"`. Plan assumes `2026 plans` / slug `2026-plan`.
2. **The 16 posts that already have a series.** Options:
   - **A (recommended): skip them.** They keep their topical series;
     the yearly series misses them (2025 would show 45, 2026 would show 36).
   - B: overwrite with the yearly series (loses topical series pages).
   - C: extend the schema to `series` as an array (touches `content.config.ts`,
     `post.ts`, `filter.ts`, `extract.ts`, tests, and every series UI).
     This is the only option that gives complete 52-per-year series.
3. **Year source.** Plan uses the directory year (`_docs/YYYY/...`).

## Steps

### Step 1 — Dry run script

Write a throwaway script in the scratchpad (not committed) that, for each
`.md` under `_docs`:

1. Applies the matching rule from Findings (first H1 or filename).
2. Derives `year` from the path.
3. Reports: files to change, files skipped (existing series), files with no
   frontmatter.

Gate: counts match the table above (49 / 52 / 52 / 45, 16 with series). Print the
list of matched titles per year and eyeball for false positives.

### Step 2 — Apply frontmatter edit

For each selected file, insert before the closing `---` of the frontmatter:

```yaml
series:
  name: ${year} plans
  slug: ${year}-plan
```

Rules:

- Text edit only (no YAML re-serialization) so key order, quoting, and
  indentation of existing fields stay untouched.
- Match the file's existing indent style (4 spaces is common in `tag:`/`cover:`).
- Idempotent: skip if `series:` is already present.

Gate: `git diff --stat` in the submodule shows only added lines, 4 per file.

### Step 3 — Verify

- `pnpm content:prepare` if it consumes frontmatter (check
  `.agents/skills/generated-content/SKILL.md` first).
- `pnpm build` (runs `astro check`): schema validation passes.
- `pnpm dev`: open `/series/2026-plan` and confirm the post count equals the
  number tagged for 2026; spot-check one 2023 post.
- `pnpm test:unit`.

### Step 4 — Commit

1. Commit in the `src/content` submodule.
2. Bump the submodule pointer in this repo in a separate commit.

## Rollback

`git revert` the submodule commit (the change is purely additive), then
bump the pointer again.
