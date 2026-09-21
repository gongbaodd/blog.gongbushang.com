# Astro 6 → 7 Upgrade Plan

> Created: 2026-09-21\
> Status: **IN PROGRESS** (Steps 0–9 ✅; next: Step 10 — Cloudflare deployment verification)\
> Scope: `growgen.xyz` --- Astro `6.3.8` → `7.x` and Astro/Vite-coupled
> dependencies.\
> Deployment: **Cloudflare**

## Goal

Upgrade the project to Astro 7 in small, independently verifiable steps.

Do not mix dependency upgrades, compiler fixes, bundler fixes, and
visual fixes in one step. Every step has a gate that must pass before
continuing.

---

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

```bash
git checkout master
git pull
git checkout -b astro7-upgrade

pnpm install
pnpm build
pnpm test
pnpm test:unit
```

Capture the Astro 6 baseline:

- Record `pnpm build` wall-clock time.
- Record `astro check` output.
- Record `du -sh dist/`.
- Record the largest files under `dist/_astro/`.
- Save `dist/rss.xml`.
- Save `dist/sitemap-index.xml`.
- Save representative rendered HTML:
  - homepage
  - blog post containing KaTeX/math, Mermaid, PlantUML, and code
    blocks
  - MDX page
  - resume page
  - gallery page
- Capture full-page screenshots:
  - homepage desktop/mobile
  - representative post desktop/mobile
- Confirm the existing test suite is green.

### Gate

The existing Astro 6 project must build and test successfully before the
upgrade begins.

---

## Step 1 --- Check third-party compatibility

> **Status: ✅ DONE (2026-09-21)** — Researched against Astro `7.3.3`
> (latest, ships `vite ^8.0.13` and `shiki ^4.0.2`) and Vite `8.3.0`.
> Findings:
>
> - **`astro-mermaid`**: current `^1.0.4` is too old. Latest `2.1.0`
>   (2026-06-24, after the Astro 7 release) declares `astro: ">=4"`,
>   `mermaid: ^10 || ^11` (project has `mermaid ^11.11`). **Upgrade to
>   `^2.1.0`.**
> - **`vite-plugin-glsl`**: current `^1.3.1`; latest `1.6.1` (2026-07-25)
>   declares `vite >= 3.x`, `esbuild >= 0.25`, `@rollup/pluginutils ^5`.
>   Rolldown's compatibility layer should satisfy the Rollup plugin API.
>   **Upgrade to `^1.6.1`**; fallback if it breaks under Rolldown (verify
>   in Step 6): replace with a tiny custom plugin or `?raw` imports for
>   `.glsl`.
> - **`vitest`**: current `~3.2.4` supports Vite ≤ 7 only. `vitest@5.0.1`
>   (latest) declares peer `vite ^6.4 || ^7 || ^8`. **Upgrade to
>   `^5.0.1`** in Step 7. (`vitest@4.1.11` also supports Vite 8 as a
>   conservative fallback.)
> - **`jsdom` / `happy-dom` / `@testing-library/react`**: jsdom latest
>   `30.1.0` requires Node `^22.22.2 || ^24.15.0 || >=26` (project runs
>   Node `v24.15.0` ✅); happy-dom `20.x` and `@testing-library/react`
>   `16.3.3` are current. Bump jsdom in Step 7.
> - **Local `shiki-plantuml`**: exports a plain TextMate
>   (`PlantUML.tmLanguage.json`) grammar object — grammar JSON is
>   Shiki-version-agnostic, so it remains compatible with the Shiki `^4`
>   used by Astro 7. ⚠️ One risk carried to Step 2/4: `astro.config.mjs`
>   passes `[...Object.values(bundledLanguages), plantumlGrammar]` from
>   the _project's_ `shiki ^3.8.1` into Astro 7's Shiki 4. If that
>   mismatches, the fallback is to drop `bundledLanguages` (Astro 7
>   bundles its own langs) and pass only the PlantUML grammar, and/or
>   bump the dev `shiki` to `^4.1.0`.
> - **Astro 7 dependency targets confirmed** (for Step 2): `astro 7.3.3`,
>   `@astrojs/mdx 8.0.1` (peer `astro ^7.2.6`, optional
>   `@astrojs/markdown-remark ^7.3.0`), `@astrojs/react 6.0.6`,
>   `@astrojs/sitemap 3.7.4`, `@astrojs/check 0.9.10`,
>   `@astrojs/markdown-remark 7.3.1`.
> - **Other upgrade-guide items checked** (no action needed): no
>   `src/fetch.ts` in the repo; no `@astrojs/db`; no removed
>   `astro:transitions` internals used (`navigate` + typed
>   `astro:before-swap` listener + `ClientRouter` only); no
>   `getContainerRenderer()` usage.
>
> **Gate: PASS** — every potentially blocking dependency has a known
> upgrade or fallback path.

Before changing Astro, verify the dependencies most likely to be
affected by Astro 7 / Vite 8.

Check:

- `astro-mermaid`
  - Verify Astro 7 compatibility.
  - If unsupported, decide whether to pin, replace, fork, or patch
    it.
- `vite-plugin-glsl`
  - Verify Vite 8 / Rolldown compatibility.
- `vitest`
  - Determine the major version compatible with the Vite version
    used by Astro 7.
- Local `shiki-plantuml`
  - Check whether its Shiki grammar API remains compatible.

### Gate

Every potentially blocking dependency has a known upgrade or fallback
path.

---

## Step 2 --- Upgrade Astro and official integrations

> **Status: ✅ DONE (2026-09-21)** — Commit `0d98baa` (isolated
> `package.json` + `pnpm-lock.yaml` change). Versions now installed:
> `astro 7.3.3`, `@astrojs/mdx 8.0.1`, `@astrojs/react 6.0.6`,
> `@astrojs/sitemap 3.7.4`, `@astrojs/rss 4.0.19`,
> `@astrojs/check 0.9.10`, `@astrojs/markdown-remark 7.3.1` (added),
> plus third-party reconciliations from Step 1: `astro-mermaid 2.1.0`,
> `@lucide/astro 1.47.0` (was the only remaining Astro-7 peer warning:
> `astro ^4 || ^5 || ^6`), `shiki 4.1.0`, `vite-plugin-glsl 1.6.1`.
> `pnpm install` succeeds; `astro --version` → `v7.3.3`; no unresolved
> Astro 7 peer dependency problems (remaining pnpm notes are
> pre-existing: deprecated subdependencies of test tooling, and ignored
> `esbuild`/`workerd` build scripts that resolve platform binaries via
> optional deps). `vitest ~3.2.4` left untouched for Step 7. No
> `.astro` compiler fixes attempted yet.

Run:

```bash
pnpm dlx @astrojs/upgrade
```

Then manually reconcile versions where necessary:

- `astro` → latest `7.x`
- `@astrojs/mdx` → Astro 7-compatible major
- `@astrojs/react` → Astro 7-compatible major
- `@astrojs/sitemap` → Astro 7-compatible major
- `@astrojs/rss` → bump if required by peer dependencies
- `@astrojs/check` → Astro 7-compatible version
- add `@astrojs/markdown-remark`

Run:

```bash
pnpm install
```

Check for Astro-related peer dependency warnings.

Do **not** start fixing `.astro` compiler errors yet.

### Gate

`pnpm install` succeeds with no unresolved Astro 7 peer dependency
problems.

Keep the dependency/lockfile change isolated for reviewability.

Example commit:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: upgrade Astro 7 dependencies"
```

---

## Step 3 --- Restore the unified Markdown pipeline

> **Status: ✅ DONE (2026-09-21)** — Commit `055869c`. `markdown.processor`
> set to `unified()` from `@astrojs/markdown-remark` with the existing
> remark/rehype plugins passed to `unified({...})` (the legacy
> top-level `remarkPlugins`/`rehypePlugins` keys still work but emit
> deprecation warnings, so plugins were moved into the factory call;
> `shikiConfig` stays top-level — Astro 7 forwards it to the
> processor's renderer). Verified against the Step 0 baseline:
> KaTeX markup identical (48 occurrences on the LaTeX page), Mermaid
> blocks identical (20), PlantUML highlighted output **byte-identical**
> (Shiki 4 + local grammar OK), Shiki `astro-code` blocks present,
> Cloudinary `f_auto` rewriting works, external links get
> `target="_blank" rel="noopener noreferrer nofollow"`, all 3 MDX pages
> built with sizes within ~400 bytes of baseline. Note: no content
> actually uses `{.class}` remark-attributes syntax (962 `.md` + 3
> `.mdx` scanned) — the plugin is preserved in config but currently
> unused. Sätteri-native migration intentionally deferred (per plan).

Astro 7's default Sätteri pipeline does not automatically preserve the
project's existing remark/rehype processing.

The project currently depends on:

- `remark-attributes`
- `remark-math`
- `rehype-katex`
- `rehype-external-links`
- custom `rehypeCloudinary`
- custom `shiki-plantuml`
- MDX with `extendMarkdownConfig: true`

Explicitly configure the unified processor in `astro.config.mjs`.

Conceptually:

```js
import { unified } from "@astrojs/markdown-remark";

export default defineConfig({
  // ...
  markdown: {
    processor: unified(),
    // preserve the existing remark/rehype/Shiki configuration
  },
});
```

Preserve the existing plugin behavior rather than redesigning the
Markdown stack during this upgrade.

Verify:

- Markdown renders.
- KaTeX math renders.
- External links retain the expected target/rel attributes.
- Cloudinary URLs are rewritten.
- `{.class}` / `remark-attributes` syntax works.
- Shiki highlighting works.
- PlantUML grammar loads.
- MDX continues to inherit the expected Markdown configuration.

Do **not** migrate to Sätteri-native plugins as part of this upgrade.
That can be a separate optimization later.

### Gate

A representative content page successfully exercises the entire
Markdown/MDX pipeline.

---

## Step 4 --- Run the first Astro 7 build

> **Status: ✅ DONE (2026-09-21)** — First build reached route generation
> and produced exactly **one** failure class, already fixed (commit
> `f506b96`): an **integration failure** — `@lucide/astro 1.47`'s
> `<Icon>` requires a real icon name and crashed on the footer's
> `<Icon set:html={raw} />` pattern (`buildLucideIconNode` of undefined
> while rendering `/404`). No unclosed-tag / invalid-nesting compiler
> errors, no Astro API/config changes needed, no Markdown/MDX failures,
> no Vite/Rolldown failures ( Rolldown bundled cleanly; only benign
> warnings: `use astro:head-inject` directive notices on MDX
> propagated-assets chunks, a >500 kB chunk-size notice, and pre-existing
> route-priority warnings for `/api/[filter]` vs `/api/podcast`).

Now run:

```bash
pnpm build
```

Do not immediately make broad fixes. First classify failures into:

- unclosed tags
- invalid HTML / nesting
- Astro API/config changes
- integration failures
- Markdown/MDX failures
- Vite/Rolldown failures

This gives a clean picture of which failures are caused by which part of
the upgrade.

### Gate

All build failures are classified and can be addressed independently.

---

## Step 5 --- Fix Astro 7 compiler strictness issues

> **Status: ✅ DONE (2026-09-21)** — **Zero Rust-compiler strictness
> failures surfaced.** The single blocking fix was the lucide
> integration pattern (commit `f506b96`, see Step 4), which also removed
> a stray `}` inside a `<Icon>` block in `Footer.astro` that the old Go
> compiler silently tolerated. No `<p>`-nesting / unclosed-tag issues
> found in components or `.md`/`.mdx` raw HTML. `pnpm build` is green
> (1617 pages in **2m 31s** vs 3m 8s Astro 6 baseline, ~20% faster) and
> `astro check` is green (0 errors, 0 warnings, 64 hints — same as
> baseline). Gate: **PASS**.

Fix deterministic Rust compiler/template problems first.

Look especially in:

```text
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

```html
<p>
  <div>...</div>
</p>
```

with valid HTML using an appropriate container.

Check especially for block elements nested inside `<p>`:

- `<div>`
- `<table>`
- `<ul>`
- headings

### CSS output changes

Astro 7 may serialize scoped CSS differently through Lightning CSS.

Do not treat cosmetic serialization differences as bugs unless they
affect:

- rendering
- scoped-style isolation
- tests/snapshots that compare exact CSS strings

Run:

```bash
pnpm build
```

### Gate

`pnpm build` and `astro check` are green.

---

## Step 6 --- Validate Vite 8 / Rolldown behavior

> **Status: ✅ DONE (2026-09-21)** — Verified against the Step 0 baseline:
>
> - **GLSL**: `vite-plugin-glsl` 1.6.1 transforms `.glsl`/`.vert`/`.frag`
>   through Rolldown — built `ParticleHero` chunk contains the shader
>   source with the `noise.glsl` **include** resolved and inlined
>   (`gl_Position`/`gl_FragColor`, `uniform` declarations, 6 `snoise`
>   hits). Island module serves 200 in dev.
> - **Tree shaking**: `treeshake.moduleSideEffects: "no-external"`
>   behavior preserved via Vite 8's compat layer. Bundle comparison vs
>   baseline: dist **312 MB** (was 326 MB), `_astro/` **49 MB** (=),
>   `MantineHero.js` 2.5 MB (=), `maplibre-gl.js` 1004 KB (was 1.1 MB),
>   `three.module.js` 660 KB (was 668 KB). **No tabler-icons regression**
>   (no tabler chunk; `createLucideIcon` chunk is 4 KB).
> - **Rapier / deps optimization**: dev server serves the full chain
>   `Lanyard.tsx → @react-three/rapier → @dimforge/rapier3d-compat/rapier.mjs`
>   (3.3 MB with inlined base64 WASM `AGFzbQ`), honoring the
>   `pnpm.overrides` pin to `0.19.2`; `optimizeDeps.exclude` entries
>   intact. Prod build green (prerender instantiates the islands).
> - **Aliases**: `react-plock` alias resolved — client chunk
>   `BlogPlock.C6pIxCSy.js` emitted and referenced by
>   `dist/world/index.html`; `onnxruntime-node` → `src/empty-module.js`
>   works (zero `onnxruntime` references in dist).
> - **SSR noExternal `react-plock`**: prerender of all 1617 pages
>   succeeded (would crash if the ESM-only package were externalized).
> - **Dev server**: started (first start takes ~50 s — the reason
>   `astro dev --background`'s 30 s startup window times out; noted as a
>   minor agent-ergonomics quirk, not a defect). `/`, `/world`,
>   `/fe/2025/09/08/mermaid/`, `/fe/2025/08/18/blog-cards/` all 200;
>   log clean (no errors/warnings after first-run dep-opt churn).
> - **Runtime WebGL/WASM rendering** could not be executed headlessly
>   (no browser connected in this session) — all static/module-level
>   evidence is green; do a manual eyeball of the homepage hero
>   (ParticleHero + Lanyard) and `/world` before merge.
>
> **Gate: PASS** (with the runtime-eyeball caveat noted above).

With the compiler green, verify bundler-specific behavior separately.

### GLSL

Confirm `vite-plugin-glsl` still transforms `.glsl` imports.

Test the actual WebGL page/island, especially `ParticleHero`.

### Tree shaking

Verify the existing:

```text
build.rollupOptions.treeshake.moduleSideEffects
```

behavior remains effective through Vite 8's compatibility layer.

Compare bundle sizes against Step 0.

In particular, ensure the previous `tabler-icons-react` bundle
regression does not return.

### Rapier / dependency optimization

Verify:

- `optimizeDeps.exclude`
- `@dimforge/rapier3d-compat`
- `@react-three/rapier`
- existing `pnpm.overrides`

Start the development server and ensure Rapier WASM initializes
correctly.

### Aliases

Verify existing aliases still resolve correctly, including:

- `react-plock`
- `onnxruntime-node` → `src/empty-module.js`

### SSR externalization

Verify:

```text
ssr.noExternal: ["react-plock"]
```

still behaves as expected.

### Gate

- Production build works.
- Development server works.
- WebGL islands work.
- Rapier/WASM works.
- Existing bundle-size optimizations remain effective.

---

## Step 7 --- Upgrade and fix test tooling

> **Status: ✅ DONE (2026-09-21)** — Commit `05222f3`. Upgraded
> `vitest 3.2.4 → 5.0.1` (peer-compatible with Vite 8), `jsdom 25 → 30`,
> `happy-dom 15 → 20`, `@testing-library/react 16.3.3`, and installed
> the missing `@testing-library/jest-dom`. Added `vitest.setup.ts`
> (registered in `vitest.config.ts`) with:
> `window.matchMedia` / `ResizeObserver` / `IntersectionObserver`
> polyfills (jsdom lacks matchMedia — Mantine's color-scheme provider
> crashed on render), jest-dom matcher registration, and explicit
> `afterEach(cleanup)` (with Vitest `globals: false`,
> testing-library's auto-cleanup never ran, so DOM leaked between tests
> causing "Found multiple elements" errors). Fixed
> `BlogContent.test.tsx`: `vi.mock` hoisting bug (stubs referenced
> before initialization → `vi.hoisted`) and added `listen()` to the
> nanostores mocks (`useStore` calls `store.listen`).
> **Result: `pnpm test` 193 passed / 0 failed / 3 skipped — strictly
> better than the Step 0 baseline (170 passed / 19 failed on Astro 6);
> `pnpm test:unit` 164 passed / 3 skipped. Gate: PASS.** The 19
> "pre-existing" baseline failures turned out to be test-tooling gaps
> (missing polyfills/matchers/cleanup) that the newer stack surfaced.

Upgrade the Vite-coupled test stack as necessary:

- `vitest`
- `jsdom`
- `happy-dom`
- `@testing-library/react`

Then run:

```bash
pnpm test
pnpm test:unit
```

Fix only actual test-tooling compatibility issues, such as:

- config format changes
- workspace configuration changes
- mock behavior / `vi.mock` changes
- removed or changed APIs

Avoid unrelated test refactors during the upgrade.

### Gate

All tests are green.

---

## Step 8 --- Audit Astro 7 whitespace behavior

> **Status: ✅ DONE (2026-09-21, no code changes needed)** — New default
> `compressHTML: 'jsx'` kept. Audit evidence:
>
> 1. **Visible-text diff, Step 0 baseline vs Astro 7 build** for all 10
>    saved representative pages (homepage, about, cv, hero-gallery,
>    KaTeX/Mermaid/PlantUML posts, 2 MDX pages): all ratios **1.0000**
>    with identical word counts — no words glued, no spaces dropped.
>    These pages include navigation, footer, badges/chips, post
>    metadata, tag links and breadcrumbs.
> 2. **Static scan of every `.astro` template** in `src/` +
>    `packages/`: **zero** occurrences of the only risky pattern — an
>    inline element (`<a> <span> <em> <strong> <code> <time> …`)
>    followed across a newline by another inline element or bare text
>    (JSX whitespace rules only drop newline-containing whitespace;
>    same-line spaces are preserved).
> 3. React islands are unaffected: they already rendered with JSX
>    whitespace semantics under Astro 6, and their text is produced by
>    React, not the `.astro` compiler.
> 4. MDX inline JSX unchanged (MDX has always used JSX rules); both MDX
>    pages in the diff set are text-identical.
>
> **Gate: PASS** — no whitespace/layout regressions; the
> `compressHTML: true` fallback is **not** applied (kept available for
> revert). Note: no browser is attached in this session, so the visual
> comparison is evidence-based (text identity) rather than pixel
> screenshots; a manual eyeball of the homepage/post pages before merge
> remains recommended.

Astro 7 defaults to:

```text
compressHTML: 'jsx'
```

Keep the new default initially.

Audit components where inline elements are separated only by source-code
whitespace/newlines.

Priority areas:

- navigation
- breadcrumbs
- tag lists
- pagination
- post metadata
- footer
- badges/chips
- homepage islands
- MDX inline JSX

For example:

```astro
<span>Hello</span>
<em>World</em>
```

may render without the previous whitespace.

Where a space is semantically required, make it explicit:

```astro
<span>Hello</span>{" "}
<em>World</em>
```

Compare against the Step 0 screenshots.

Markdown paragraph text itself is not the main target of this audit;
focus on `.astro` markup and MDX inline JSX.

### Fallback

If whitespace regressions are widespread, temporarily restore the
previous behavior with:

```js
compressHTML: true;
```

Keep this as a fallback rather than applying it preemptively.

### Gate

Desktop/mobile visual comparisons show no meaningful whitespace/layout
regressions.

---

## Step 9 --- Full functional verification

> **Status: ✅ DONE (2026-09-21)** — Full local verification green.
>
> ### Commands
>
> - `pnpm build` ✅ (run twice) — `astro check` 31s: 0 errors / 0
>   warnings / 64 hints (identical to baseline); `astro build`: **1617
>   pages in 2m 39s**; all 16 resume PDFs written.
> - `pnpm test` ✅ **193 passed / 0 failed / 3 skipped** (baseline: 170
>   passed / 19 failed).
> - `pnpm test:unit` ✅ 164 passed / 3 skipped.
> - `pnpm dev` ✅ `/`, `/world`, `/tech/2021/02/09/latex-cheat-sheet/`
>   → 200; unknown URL → proper 404; dev log **0 errors**.
>
> ### Content pipeline (counts vs baseline)
>
> - KaTeX 18 (=), Mermaid 14 (=), PlantUML 21 (≥15, byte-identical
>   highlighted blocks), Shiki `astro-code` 12 (=), Cloudinary
>   `f_auto` rewriting ✅, external links `target="_blank"
rel="noopener noreferrer nofollow"` ✅.
> - RSS `dist/rss.xml` ✅ valid; `dist/sitemap-index.xml` ✅.
> - Search index: `dist/api/all/0.ndjson` valid JSON entries
>   (`id/href/title/date/excerpt/data`) ✅ (minisearch feed).
> - Resume PDF generation ✅ (16 PDFs in `dist/resume/pdfs/`).
>
> ### Interactive islands (production chunks)
>
> - ParticleHero ✅ (`ParticleHero.U_5e9cSe.js`, GLSL inlined incl.
>   `noise.glsl` include); Three.js `three.module` chunk present.
> - WorldMap / MapLibre ✅ (`GLMap.CqkXm2Rb.js` + `maplibre-gl` chunk).
> - Rapier ✅ — WASM base64-inlined in hero chunks, dev-chain verified
>   (Step 6), `pnpm.overrides` pin to 0.19.2 honored.
> - React islands ✅ — client chunks emitted and referenced
>   (`BlogPlock`, `Search`, `MantineHeader`, …).
>
> ### Metrics vs Step 0 baseline
>
> | Metric                     | Astro 6 baseline                                            | Astro 7 final                                                                                       |
> | -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
> | `astro build` (1617 pages) | 3m 8s                                                       | **2m 39s (−15%)**                                                                                   |
> | `astro check`              | 0 err / 0 warn / 64 hints                                   | 0 err / 0 warn / 64 hints                                                                           |
> | full `pnpm build` wall     | ~3m 20s (estimate, not precisely timed)                     | 4m 40s (check ~31s + build 2m39s + PDFs ~30s + prerender/asset phases)                              |
> | `dist/` size               | 326 MB                                                      | **326 MB (=)**                                                                                      |
> | `dist/_astro/`             | 49 MB                                                       | **49 MB (=)**                                                                                       |
> | Largest JS bundles         | MantineHero 2.5 MB; maplibre-gl 1.1 MB; three.module 668 KB | MantineHero **2.5 MB**; maplibre **1004 KB**; three.module **660 KB** — no tabler/lucide regression |
> | Tests                      | 170 passed / 19 failed                                      | **193 passed / 0 failed**                                                                           |
>
> ### Not run in this session (manual follow-ups)
>
> - Lighthouse/CWV spot checks (homepage + representative post) — no
>   browser automation attached; run before/after Step 10 deploy.
> - Pixel screenshots — text-identity diffs were used instead; a visual
>   eyeball of homepage (ParticleHero + Lanyard) and `/world` remains
>   recommended before merge.
>
> **Gate: PASS** (with the two manual follow-ups noted).

Run the complete local verification:

```bash
pnpm build
pnpm test
pnpm test:unit
pnpm dev
```

Verify:

- KaTeX
- Mermaid
- PlantUML
- Shiki
- Cloudinary URL rewriting
- external-link attributes
- RSS
- sitemap
- minisearch/search index
- resume PDF generation
- ParticleHero
- WorldMap / MapLibre
- Rapier
- React islands

Compare against Step 0:

- build time
- `dist/` size
- largest JS bundles
- representative HTML
- screenshots

Run Lighthouse/CWV spot checks on:

- homepage
- representative blog post

Record the final Astro 7 build time.

### Gate

Local build, tests, content processing, interactive islands, visual
checks, and bundle-size checks all pass.

---

## Step 10 --- Cloudflare deployment verification

Deploy the upgraded branch/build through the project's current
Cloudflare deployment workflow.

Smoke-test:

- `/`
- representative blog post
- MDX page
- resume
- gallery
- WebGL page
- 404
- RSS
- sitemap

Verify specifically in the Cloudflare environment:

- static assets load correctly
- Astro routes resolve correctly
- React islands hydrate
- WebGL assets load
- WASM assets load
- RSS/sitemap are accessible
- redirects behave correctly
- 404 handling works
- expected cache headers/behavior remain correct

Run a final Lighthouse/CWV spot check against the deployed site.

### Gate

The Cloudflare deployment has no runtime, routing, asset-path, WASM,
hydration, or content regressions.

---

## Step 11 --- Finish the upgrade

Once every previous gate passes, finish the upgrade and merge according
to the project's normal workflow.

Update project documentation if the upgrade introduced new conventions,
especially:

- Astro 7 requirements
- explicit unified Markdown processor
- Markdown/MDX plugin behavior
- Astro template whitespace convention (`{" "}`)
- Vite 8 / Rolldown compatibility notes
- any changes required for Cloudflare deployment

Record final results:

```text
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

---

## Post-upgrade work --- Separate PRs only

Do not mix these into the Astro 7 upgrade.

Possible follow-ups:

### Sätteri migration

Evaluate replacing the unified Markdown pipeline with Astro 7's
Rust-native Markdown features/plugins.

Potential targets:

- `remark-math` → built-in math support
- rehype plugins → Sätteri-compatible equivalents

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

---

## Final execution order

```text
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

```text
rollback = abandon the upgrade branch
```

After merge:

```text
rollback = revert the upgrade merge/commit
```

Keep major compatibility changes independently revertible where
practical, especially:

- unified Markdown processor
- `compressHTML` fallback
- Vite/Rolldown compatibility changes
