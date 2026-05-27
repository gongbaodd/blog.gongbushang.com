---
name: astro-build
description: Use Astro (astro.build) patterns and official docs when working with Astro projects—pages, routing, .astro components, content collections, and framework integrations (React, etc.). Use when editing Astro files, adding pages or API routes, or when unsure about Astro syntax or conventions.
---

# Using Astro (astro.build)

Use this skill when working on Astro-based projects. Prefer the [official Astro docs](https://docs.astro.build) as the authoritative source; this file summarizes key patterns and links to them.

## Quick reference

- **Docs**: [docs.astro.build](https://docs.astro.build)
- **Getting started**: [Getting started](https://docs.astro.build/en/getting-started/)
- **Install**: `npm create astro@latest`

## Pages and routing

- Pages live in `src/pages/`. File-based routing: each file becomes an endpoint by path.
- Supported in `src/pages/`: `.astro`, `.md`, `.mdx` (with MDX integration), `.html`, and `.js`/`.ts` (as [endpoints](https://docs.astro.build/en/guides/endpoints/)).
- Use standard `<a href="...">` for links. Dynamic routes: [Routing](https://docs.astro.build/en/guides/routing/).

## Astro components (`.astro`)

- Component script (JS/TS) between the first `---` fence; template (HTML + expressions) after the second `---`.
- No client runtime by default; components render to static HTML.
- **Props**: `const { propName } = Astro.props;` (optional with defaults: `const { greeting = "Hello" } = Astro.props`).
- **Slots**: `<slot />` for default children; `<slot name="after-header" />` for named. Fallback: `<slot><p>Fallback</p></slot>`.
- **Fragments**: Use `<Fragment>` (or `<>`) when you need multiple root elements or to pass multiple elements into a named slot.
- **Template expressions**: `{variable}`, `{items.map(item => <li>{item}</li>)}`, `{condition && <p>Show</p>}`. Use `set:html` only when necessary for raw HTML.
- **Dynamic tags**: Assign tag or component to a capitalized variable, e.g. `const Element = 'div'; <Element>...</Element>`.
- In templates, use `class` and `data-*` (kebab-case), not `className`/camelCase.

## Content collections

- Configure in `src/content.config.ts` with `defineCollection()` and export `collections`.
- Use loaders: `glob({ pattern: "**/*.md", base: "./src/data/blog" })` or `file("src/data/dogs.json")`. Schema with Zod for type safety.
- Query in pages/layouts: `getCollection()`, `getEntry()`, `render()` — see [Content collections](https://docs.astro.build/en/guides/content-collections/).
- TypeScript: use `astro/tsconfigs/strict` (or ensure `strictNullChecks` and `allowJs`).

## Framework components (e.g. React)

- Install integration (e.g. `@astrojs/react`), then import and use in `.astro`: `<MyReactComponent />`.
- By default they render on the server only (static HTML). For interactivity use a **client directive**:
  - `client:load` — hydrate when page loads
  - `client:visible` — hydrate when in viewport
  - `client:idle` — hydrate when browser idle
  - `client:only="react"` — skip server render, client-only
- Props to hydrated components must be serializable (no functions). Supported: plain objects, primitives, Array, Map, Set, Date, RegExp, URL, etc.
- [Framework components](https://docs.astro.build/en/guides/framework-components/), [Client directives](https://docs.astro.build/en/reference/directives-reference/#client-directives).

## Endpoints and API routes

- Export a function (e.g. `GET`, `POST`) from a `.ts`/`.js` file in `src/pages/` to create an endpoint. Return a `Response` or object; use `export const prerender = false` if the route must run at request time.

## When to look up the docs

- **Syntax details**: [Template expressions](https://docs.astro.build/en/reference/astro-syntax/), [Directives](https://docs.astro.build/en/reference/directives-reference/).
- **Content Layer / collections**: [Content collections](https://docs.astro.build/en/guides/content-collections/), [Content loader reference](https://docs.astro.build/en/reference/content-loader-reference/).
- **Integrations**: [Integrations guide](https://docs.astro.build/en/guides/integrations-guide/), [View Transitions](https://docs.astro.build/en/guides/view-transitions/), [Testing](https://docs.astro.build/en/guides/testing/).
