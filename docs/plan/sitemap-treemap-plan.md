# Plan — Visual sitemap page (treemap)

> Status: **DONE** (see "Implementation notes" at the end)
> Related: `docs/plan/adsense-rejection-fix-plan.md` (the footer "Sitemap" link now points to `/sitemap`)

## Goal

One page, `/sitemap`, that shows the whole site as an interactive treemap: area = number of posts,
grouped Category → Year → (Series). It doubles as a navigation page for readers and, because it also
renders a plain link list, as real crawlable content. (The XML sitemap stays at `/sitemap-index.xml`.)

## Library choice

| Option | Notes |
| --- | --- |
| **Recharts `Treemap`** (recommended) | `recharts@^3.2.1` is already a dependency, React-only, supports custom node renderers and click handlers. No new package. |
| `d3-hierarchy` + own SVG | Smallest runtime, full control over layout (squarified), but you write the rendering. |
| `@nivo/treemap` | Nicer defaults, adds a large dependency. |
| ECharts | Powerful, heavy bundle. |

Start with Recharts; fall back to `d3-hierarchy` if the custom labels get awkward.

## Data

1. Build the tree at build time in the `.astro` page from `getAllPosts()` and the helpers in
   `packages/utils/badges.ts` / `filter.ts`:
   `{ name: "GrowGen", children: [{ name: category, href: "/<category>", children: [{ name: year, href: "/<category>/<year>", value: postCount }] }] }`.
2. Pass the tree as a prop to a React island `packages/sitemap/SitemapTreemap.tsx`
   (`client:visible`, wrapped in `CustomMantineProvider`, WebGL not needed).

## Component

1. `ResponsiveContainer` + `Treemap` with `dataKey="value"`, a custom `content` renderer that draws
   the label and post count when the cell is large enough, and `onClick` → `window.location.assign(href)`.
2. Colour by category using Mantine theme tokens so it follows light/dark.
3. Tooltip: "{category} / {year} — {n} posts".
4. Wrap in an error boundary (see `.agents/skills/webgl-components/SKILL.md` for the pattern).

## Crawlable fallback (important for AdSense)

Under the chart render a server-side nested `<ul>`: category → years → links, with post counts. The
treemap is progressive enhancement; the list is the content Google sees.

## Steps

1. `packages/sitemap/` with tree builder (`buildSitemapTree.ts`, unit-tested with vitest) and the
   island.
2. `src/pages/sitemap.astro` using the standard `Global` / `Header` / `Footer` layout.
3. Point the footer "Sitemap" link at `/sitemap` and add it to the header/menu if wanted.
4. Add `/sitemap` to nothing special: it is a normal indexable page (the `astro.config.mjs` sitemap
   filter does not exclude it).
5. Verify at 375px, 768px and desktop, light and dark; keyboard access works through the list.

## Gates

`pnpm build` green; `/sitemap` has > 300 characters of server-rendered text; clicking a cell opens the
right list page; unit test covers the tree totals equalling `getAllPosts().length`.

## Implementation notes

- `packages/sitemap/`: `buildSitemapTree.ts` (Category → Year tree, unit-tested), `cell.ts` (colour, label-fit and
  tooltip helpers, unit-tested) and `SitemapTreemap.tsx` (Recharts `Treemap` island, `client:visible`, error boundary
  with an empty fallback because the link list below is the fallback).
- `src/pages/sitemap.astro` builds the tree from `getAllPosts()` and throws at build time if the tree total differs
  from `getAllPosts().length`. It renders the treemap plus a server-rendered `<nav>` list (category → year links with
  counts).
- Cells are real `<a href>` elements inside the SVG, not `window.location.assign` handlers, so they work with the
  keyboard, middle-click and prefetch.
- **Year cells link to `/year/<year>`, not `/<category>/<year>`.** There is no category + year list page (only the post
  route `[category]/[year]/[month]/[day]/[slug]` exists), so a year cell opens that year across all categories. The
  category name in the link list links to `/<category>`. Adding a real `/<category>/<year>` page is a separate task.
- The Series level was left out: the Data section only specifies Category → Year, and series already have `/series/*`.
- The footer link now points to `/sitemap`; the XML sitemap stays at `/sitemap-index.xml`. The header menu is unchanged
  (changing `ROUTES` would also change the e2e navigation scenarios).
- e2e: a `/sitemap` scenario was added to `e2e/features/static-routes.feature`.
- Verified: 984 posts, 9 categories, 12 years; server-rendered text ~1.2k characters; `/sitemap/` is in `sitemap-0.xml`.
