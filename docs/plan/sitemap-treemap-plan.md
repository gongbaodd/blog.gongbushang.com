# Plan — Visual sitemap page (treemap)

> Status: **NOT STARTED**
> Related: `docs/plan/adsense-rejection-fix-plan.md` (footer "Sitemap" link currently points to `#sitemap`)

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
