# Astro 6 → 7 Upgrade Plan

> Created: 2026-09-21\
> Status: **IN PROGRESS** (Step 0 ✅ done; next: Step 1 — third-party compatibility)\
> Scope: `growgen.xyz` --- Astro `6.3.8` → `7.x` and Astro/Vite-coupled
> dependencies.\
> Deployment: **Cloudflare**

## Goal

Upgrade the project to Astro 7 in small, independently verifiable steps.

Do not mix dependency upgrades, compiler fixes, bundler fixes, and
visual fixes in one step. Every step has a gate that must pass before
continuing.

------------------------------------------------------------------------

## Step 0 --- Create upgrade branch and capture baseline

> **Status: ✅ DONE (2026-09-21)** — Branch `astro7-upgrade` created.
> Baseline captured in `docs/plan/baseline/astro6/` (see
> `BASELINE.md`): build ~3m8s / 1617 pages, `astro check` 0 errors /
> 0 warnings, `dist/` 326 MB (`_astro/` 49 MB), largest bundles
> recorded, `rss.xml` + `sitemap-index.xml` + representative rendered
> HTML saved (homepage, KaTeX/Mermaid/PlantUML posts, MDX pages, cv,
> about, gallery). `pnpm test:unit` green; full `pnpm test` has 19
> pre-existing jsdom/Mantine component-test failures already present on
> `master` (documented in `BASELINE.md`, treated as baseline — not an
> upgrade regression). Screenshots not captured; saved HTML serves as
> the visual reference for the Step 8 audit. Baseline commit: `d0b774e`.

Create a dedicated branch before changing dependencies.

``` bash
git checkout master
git pull
git checkout -b astro7-upgrade

pnpm install
pnpm build
pnpm test
pnpm test:unit
```

Capture the Astro 6 baseline:

-   Record `pnpm build` wall-clock time.
-   Record `astro check` output.
-   Record `du -sh dist/`.
-   Record the largest files under `dist/_astro/`.
-   Save `dist/rss.xml`.
-   Save `dist/sitemap-index.xml`.
-   Save representative rendered HTML:
    -   homepage
    -   blog post containing KaTeX/math, Mermaid, PlantUML, and code
        blocks
    -   MDX page
    -   resume page
    -   gallery page
-   Capture full-page screenshots:
    -   homepage desktop/mobile
    -   representative post desktop/mobile
-   Confirm the existing test suite is green.

### Gate

The existing Astro 6 project must build and test successfully before the
upgrade begins.

------------------------------------------------------------------------

## Step 1 --- Check third-party compatibility

Before changing Astro, verify the dependencies most likely to be
affected by Astro 7 / Vite 8.

Check:

-   `astro-mermaid`
    -   Verify Astro 7 compatibility.
    -   If unsupported, decide whether to pin, replace, fork, or patch
        it.
-   `vite-plugin-glsl`
    -   Verify Vite 8 / Rolldown compatibility.
-   `vitest`
    -   Determine the major version compatible with the Vite version
        used by Astro 7.
-   Local `shiki-plantuml`
    -   Check whether its Shiki grammar API remains compatible.

### Gate

Every potentially blocking dependency has a known upgrade or fallback
path.

------------------------------------------------------------------------

## Step 2 --- Upgrade Astro and official integrations

Run:

``` bash
pnpm dlx @astrojs/upgrade
```

Then manually reconcile versions where necessary:

-   `astro` → latest `7.x`
-   `@astrojs/mdx` → Astro 7-compatible major
-   `@astrojs/react` → Astro 7-compatible major
-   `@astrojs/sitemap` → Astro 7-compatible major
-   `@astrojs/rss` → bump if required by peer dependencies
-   `@astrojs/check` → Astro 7-compatible version
-   add `@astrojs/markdown-remark`

Run:

``` bash
pnpm install
```

Check for Astro-related peer dependency warnings.

Do **not** start fixing `.astro` compiler errors yet.

### Gate

`pnpm install` succeeds with no unresolved Astro 7 peer dependency
problems.

Keep the dependency/lockfile change isolated for reviewability.

Example commit:

``` bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade Astro 7 dependencies"
```

------------------------------------------------------------------------

## Step 3 --- Restore the unified Markdown pipeline

Astro 7's default Sätteri pipeline does not automatically preserve the
project's existing remark/rehype processing.

The project currently depends on:

-   `remark-attributes`
-   `remark-math`
-   `rehype-katex`
-   `rehype-external-links`
-   custom `rehypeCloudinary`
-   custom `shiki-plantuml`
-   MDX with `extendMarkdownConfig: true`

Explicitly configure the unified processor in `astro.config.mjs`.

Conceptually:

``` js
import { unified } from '@astrojs/markdown-remark'

export default defineConfig({
  // ...
  markdown: {
    processor: unified(),
    // preserve the existing remark/rehype/Shiki configuration
  },
})
```

Preserve the existing plugin behavior rather than redesigning the
Markdown stack during this upgrade.

Verify:

-   Markdown renders.
-   KaTeX math renders.
-   External links retain the expected target/rel attributes.
-   Cloudinary URLs are rewritten.
-   `{.class}` / `remark-attributes` syntax works.
-   Shiki highlighting works.
-   PlantUML grammar loads.
-   MDX continues to inherit the expected Markdown configuration.

Do **not** migrate to Sätteri-native plugins as part of this upgrade.
That can be a separate optimization later.

### Gate

A representative content page successfully exercises the entire
Markdown/MDX pipeline.

------------------------------------------------------------------------

## Step 4 --- Run the first Astro 7 build

Now run:

``` bash
pnpm build
```

Do not immediately make broad fixes. First classify failures into:

-   unclosed tags
-   invalid HTML / nesting
-   Astro API/config changes
-   integration failures
-   Markdown/MDX failures
-   Vite/Rolldown failures

This gives a clean picture of which failures are caused by which part of
the upgrade.

### Gate

All build failures are classified and can be addressed independently.

------------------------------------------------------------------------

## Step 5 --- Fix Astro 7 compiler strictness issues

Fix deterministic Rust compiler/template problems first.

Look especially in:

``` text
src/components/
packages/layouts/
packages/header/
packages/heat/
```

Also inspect `.md` and `.mdx` content where raw HTML is used.

Typical issues:

### Unclosed tags

Fix the exact locations reported by the compiler.

### Invalid HTML nesting

Do not rely on browser/parser auto-correction.

For example, replace structurally invalid markup such as:

``` html
<p>
  <div>...</div>
</p>
```

with valid HTML using an appropriate container.

Check especially for block elements nested inside `<p>`:

-   `<div>`
-   `<table>`
-   `<ul>`
-   headings

### CSS output changes

Astro 7 may serialize scoped CSS differently through Lightning CSS.

Do not treat cosmetic serialization differences as bugs unless they
affect:

-   rendering
-   scoped-style isolation
-   tests/snapshots that compare exact CSS strings

Run:

``` bash
pnpm build
```

### Gate

`pnpm build` and `astro check` are green.

------------------------------------------------------------------------

## Step 6 --- Validate Vite 8 / Rolldown behavior

With the compiler green, verify bundler-specific behavior separately.

### GLSL

Confirm `vite-plugin-glsl` still transforms `.glsl` imports.

Test the actual WebGL page/island, especially `ParticleHero`.

### Tree shaking

Verify the existing:

``` text
build.rollupOptions.treeshake.moduleSideEffects
```

behavior remains effective through Vite 8's compatibility layer.

Compare bundle sizes against Step 0.

In particular, ensure the previous `tabler-icons-react` bundle
regression does not return.

### Rapier / dependency optimization

Verify:

-   `optimizeDeps.exclude`
-   `@dimforge/rapier3d-compat`
-   `@react-three/rapier`
-   existing `pnpm.overrides`

Start the development server and ensure Rapier WASM initializes
correctly.

### Aliases

Verify existing aliases still resolve correctly, including:

-   `react-plock`
-   `onnxruntime-node` → `src/empty-module.js`

### SSR externalization

Verify:

``` text
ssr.noExternal: ["react-plock"]
```

still behaves as expected.

### Gate

-   Production build works.
-   Development server works.
-   WebGL islands work.
-   Rapier/WASM works.
-   Existing bundle-size optimizations remain effective.

------------------------------------------------------------------------

## Step 7 --- Upgrade and fix test tooling

Upgrade the Vite-coupled test stack as necessary:

-   `vitest`
-   `jsdom`
-   `happy-dom`
-   `@testing-library/react`

Then run:

``` bash
pnpm test
pnpm test:unit
```

Fix only actual test-tooling compatibility issues, such as:

-   config format changes
-   workspace configuration changes
-   mock behavior / `vi.mock` changes
-   removed or changed APIs

Avoid unrelated test refactors during the upgrade.

### Gate

All tests are green.

------------------------------------------------------------------------

## Step 8 --- Audit Astro 7 whitespace behavior

Astro 7 defaults to:

``` text
compressHTML: 'jsx'
```

Keep the new default initially.

Audit components where inline elements are separated only by source-code
whitespace/newlines.

Priority areas:

-   navigation
-   breadcrumbs
-   tag lists
-   pagination
-   post metadata
-   footer
-   badges/chips
-   homepage islands
-   MDX inline JSX

For example:

``` astro
<span>Hello</span>
<em>World</em>
```

may render without the previous whitespace.

Where a space is semantically required, make it explicit:

``` astro
<span>Hello</span>{" "}
<em>World</em>
```

Compare against the Step 0 screenshots.

Markdown paragraph text itself is not the main target of this audit;
focus on `.astro` markup and MDX inline JSX.

### Fallback

If whitespace regressions are widespread, temporarily restore the
previous behavior with:

``` js
compressHTML: true
```

Keep this as a fallback rather than applying it preemptively.

### Gate

Desktop/mobile visual comparisons show no meaningful whitespace/layout
regressions.

------------------------------------------------------------------------

## Step 9 --- Full functional verification

Run the complete local verification:

``` bash
pnpm build
pnpm test
pnpm test:unit
pnpm dev
```

Verify:

-   KaTeX
-   Mermaid
-   PlantUML
-   Shiki
-   Cloudinary URL rewriting
-   external-link attributes
-   RSS
-   sitemap
-   minisearch/search index
-   resume PDF generation
-   ParticleHero
-   WorldMap / MapLibre
-   Rapier
-   React islands

Compare against Step 0:

-   build time
-   `dist/` size
-   largest JS bundles
-   representative HTML
-   screenshots

Run Lighthouse/CWV spot checks on:

-   homepage
-   representative blog post

Record the final Astro 7 build time.

### Gate

Local build, tests, content processing, interactive islands, visual
checks, and bundle-size checks all pass.

------------------------------------------------------------------------

## Step 10 --- Cloudflare deployment verification

Deploy the upgraded branch/build through the project's current
Cloudflare deployment workflow.

Smoke-test:

-   `/`
-   representative blog post
-   MDX page
-   resume
-   gallery
-   WebGL page
-   404
-   RSS
-   sitemap

Verify specifically in the Cloudflare environment:

-   static assets load correctly
-   Astro routes resolve correctly
-   React islands hydrate
-   WebGL assets load
-   WASM assets load
-   RSS/sitemap are accessible
-   redirects behave correctly
-   404 handling works
-   expected cache headers/behavior remain correct

Run a final Lighthouse/CWV spot check against the deployed site.

### Gate

The Cloudflare deployment has no runtime, routing, asset-path, WASM,
hydration, or content regressions.

------------------------------------------------------------------------

## Step 11 --- Finish the upgrade

Once every previous gate passes, finish the upgrade and merge according
to the project's normal workflow.

Update project documentation if the upgrade introduced new conventions,
especially:

-   Astro 7 requirements
-   explicit unified Markdown processor
-   Markdown/MDX plugin behavior
-   Astro template whitespace convention (`{" "}`)
-   Vite 8 / Rolldown compatibility notes
-   any changes required for Cloudflare deployment

Record final results:

``` text
Astro version:
Build time before:
Build time after:
dist size before:
dist size after:
Largest bundle before:
Largest bundle after:
Tests:
Cloudflare deployment:
Known follow-ups:
```

------------------------------------------------------------------------

## Post-upgrade work --- Separate PRs only

Do not mix these into the Astro 7 upgrade.

Possible follow-ups:

### Sätteri migration

Evaluate replacing the unified Markdown pipeline with Astro 7's
Rust-native Markdown features/plugins.

Potential targets:

-   `remark-math` → built-in math support
-   rehype plugins → Sätteri-compatible equivalents

Only do this if the feature parity is acceptable.

### Advanced Routing

Evaluate only if the project later moves away from purely static output
or needs request-level routing behavior.

### Cloudflare-specific optimization

Evaluate Cloudflare caching and runtime features separately from the
framework upgrade.

### Build performance

Re-benchmark HTML size and build performance after the upgrade is
stable.

------------------------------------------------------------------------

## Final execution order

``` text
Baseline
   ↓
Third-party compatibility
   ↓
Astro dependencies
   ↓
Unified Markdown pipeline
   ↓
First Astro 7 build
   ↓
Compiler fixes
   ↓
Vite 8 / Rolldown
   ↓
Vitest
   ↓
Whitespace audit
   ↓
Full local verification
   ↓
Cloudflare deployment verification
   ↓
Finish / merge
```

## Rollback

All upgrade work should remain isolated on `astro7-upgrade` until
verification is complete.

Before merge:

``` text
rollback = abandon the upgrade branch
```

After merge:

``` text
rollback = revert the upgrade merge/commit
```

Keep major compatibility changes independently revertible where
practical, especially:

-   unified Markdown processor
-   `compressHTML` fallback
-   Vite/Rolldown compatibility changes
