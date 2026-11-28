---
name: astro-build
description: Use Astro (astro.build) patterns and official docs when working on apps/web or apps/admin—pages, routing, .astro components, React islands and client directives, endpoints, prerendering on Cloudflare. Use when editing Astro files, adding pages or API routes, or when unsure about Astro syntax or conventions.
---

# Using Astro (astro.build) in this repo

Both apps are Astro sites: `apps/web` (public, `@astrojs/cloudflare`) and `apps/admin` (EmDash admin, `@astrojs/node`). Prefer the [official Astro docs](https://docs.astro.build) as the authoritative source. For EmDash-specific rules (data, environments, admin) read `.agents/skills/emdash/SKILL.md` first.

## This repo's rules (apps/web)

- **`output: "server"`, but almost everything is prerendered.** Static assets are served without the Worker, and `scripts/check-static-routes.mjs` (part of `build`) fails on a public route that is not prerendered. A new page or endpoint needs `export const prerender = true` unless the emdash skill says otherwise.
- **URLs never change, or they 301.** After a route change run `pnpm --filter web parity` (oracle: `apps/web/tests/legacy-urls.txt`; moved URLs are listed in `apps/web/tests/legacy-redirects.txt` and `apps/web/public/_redirects`). Posts live at `/<YYYY>/<MM>/<DD>/<slug>/` (GON-270).
- **No content collections.** Content comes from EmDash (`src/live.config.ts` registers the loader; queries live in `src/lib/content.ts` and `src/lib/listing.ts`). Data EmDash doesn't store comes from derive output via `src/lib/legacy-data.ts`.
- **Prerender runs in workerd.** It cannot read the disk, and `process.env` is empty there; use `import.meta.env.PUBLIC_*` defined in `astro.config.mjs`.
- Path alias `@/*` = `apps/web/*`, so imports look like `@/src/lib/seo`.

## Pages and routing

- Pages live in `apps/web/src/pages/`. File-based routing: each file becomes a route by path (`[category]`, `[filter].astro`, `world/[city]`, `api/**`).
- Supported: `.astro`, `.md`, `.html`, and `.js`/`.ts` ([endpoints](https://docs.astro.build/en/guides/endpoints/)). Dynamic prerendered routes need `getStaticPaths()`.
- Use standard `<a href="...">` for links. [Routing](https://docs.astro.build/en/guides/routing/).

## Astro components (`.astro`)

- Component script between the `---` fences; template after.
- No client runtime by default; components render to static HTML.
- **Props**: `const { propName = "default" } = Astro.props;`
- **Slots**: `<slot />`, named `<slot name="after-header" />`, fallback content inside `<slot>`.
- **Template expressions**: `{variable}`, `{items.map(item => <li>{item}</li>)}`, `{condition && <p>Show</p>}`. Use `set:html` only when necessary.
- In templates use `class` and `data-*`, not `className`/camelCase.

## React islands

- Import React components into `.astro` files. Without a directive they render on the server only.
- Client directives: `client:load`, `client:visible`, `client:idle`, `client:only="react"`. [Directives reference](https://docs.astro.build/en/reference/directives-reference/#client-directives).
- Props to hydrated components must be serializable (no functions).
- Mantine islands need `CustomMantineProvider` (mantine-ui skill); WebGL islands need an error boundary (webgl-components skill).
- `pnpm --filter web check:hydration` checks for hydration errors on the routes in `tests/hydration-routes.txt`.

## Endpoints

- Export `GET` (etc.) from a `.ts` file in `src/pages/`. Prerendered endpoints become static files; keep the JSON shapes identical to the existing APIs.

## When to look up the docs

- [Template expressions](https://docs.astro.build/en/reference/astro-syntax/), [Directives](https://docs.astro.build/en/reference/directives-reference/), [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Testing](https://docs.astro.build/en/guides/testing/).
