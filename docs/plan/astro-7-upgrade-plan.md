# Astro 6 → 7 Upgrade Plan

> Created: 2026-09-21
> **Status: PLANNED**
> Scope: this repo (growgen.xyz) — Astro `6.3.8` → `7.x`, plus all Astro-integration-coupled dependencies.
> Sources: [Upgrade to Astro v7](https://docs.astro.build/en/guides/upgrade-to/v7/), [Astro 7.0 release post](https://astro.build/blog/astro-7/), local audit of `astro.config.mjs` / `package.json` / `src` / `packages`.

---

## 1. Current state (audited 2026-09-21)

| Item | Value | v7 impact |
|---|---|---|
| astro | `6.3.8` (exact pin) | upgrade to `7.x` |
| @astrojs/mdx | `5.0.6` (exact pin, `extendMarkdownConfig: true`) | needs v7-compatible major |
| @astrojs/react | `^5.0.5` | needs v7-compatible major |
| @astrojs/sitemap | `3.7.3` (exact pin) | needs v7-compatible major |
| @astrojs/rss | `^4.0.18` | verify peer range |
| @astrojs/check | `0.9.9` (used by `astro check` in build script) | needs v7-compatible version |
| Markdown plugins | `remark-attributes`, `remark-math`, `rehype-katex`, `rehype-external-links`, custom `rehypeCloudinary` (`packages/utils/cloudinary.ts`), custom `shiki-plantuml` grammar | **biggest change** — v7 default pipeline is Sätteri (Rust); this project must stay on the `unified()` pipeline (see §3.2) |
| `astro-mermaid` | `^1.0.4` (integration) | third-party — verify v7 support before upgrading |
| Vite usage | `vite-plugin-glsl`, `optimizeDeps.include/exclude`, `build.rollupOptions.treeshake`, `ssr.noExternal`, `resolve.alias` | Vite 8 / Rolldown — compat layer auto-converts `rollupOptions`, but plugins must be validated (§3.4) |
| `src/fetch.ts` | not present ✅ | no conflict with Advanced Routing |
| `@astrojs/db` | not used ✅ | removed in v7 — no action |
| `astro:transitions` usage | `ClientRouter` (`packages/layouts/Global.astro`), `navigate()` + `TransitionBeforeSwapEvent` type (`packages/header/`) | ✅ all still-supported APIs; none of the removed internals (`createAnimationScope`, `TRANSITION_*` constants, `isTransitionBefore*Event()`) are used |
| `getContainerRenderer()` | not used ✅ | no action |
| Experimental flags in config | none ✅ | no config removal needed |
| Runtime | Node `24.15.0`, pnpm `10.33.2` | meets v7 requirements |
| Deployment | static output, Vercel | no adapter changes required |
| Tests | Vitest `~3.2.4` (+ jsdom, happy-dom, @testing-library/react) | Vitest majors are Vite-coupled — likely needs Vitest 4 (§3.5) |

### 1.1 Risk summary (project-specific)

1. **Markdown pipeline** — 5 remark/rehype plugins + custom Shiki grammar + MDX. Auto-upgrading blindly would silently drop KaTeX math, external-link attrs, and Cloudinary image rewriting.
2. **Rust compiler strictness** — this site has ~many hand-written `.astro` components and 100+ Markdown/MDX posts; unclosed tags now **error**, and invalid HTML nesting (e.g. block elements inside `<p>`) is no longer auto-corrected.
3. **`compressHTML: 'jsx'` new default** — spaces between inline elements disappear (e.g. `<span>a</span>\n<em>b</em>` renders `ab`). Blog post cards, breadcrumbs, and tag lists are typical victims.
4. **Vite 8 / Rolldown** — `vite-plugin-glsl` and the hand-tuned `treeshake` config (added to fix the 2.2 MB tabler-icons bundle, see `website-optimization-plan.md`) must be re-verified.
5. **`astro-mermaid`** — integration API consumers can break on Vite 8; pin/verify.

---

## 2. Upgrade strategy

Upgrade on a dedicated branch with a **verified baseline first**, in small verifiable stages:

```
astro7-upgrade  (branch off master)
```

Each phase ends with a green `pnpm build` (or an explicit recorded failure with a fix). Do not combine Phase 1 with template fixes — compiler errors must be attributable to the new compiler, not to concurrent edits.

### Baseline to capture BEFORE starting (Phase 0)

- [ ] `pnpm build` on `master`: record wall-clock time (v7 claims 15–61% faster builds; we want our own number) and `astro check` output.
- [ ] `du -sh dist/` + list of largest `dist/_astro/*` bundles (compare with §3.4 and with `website-optimization-plan.md` §5).
- [ ] RSS/atom output: save `dist/rss.xml`.
- [ ] Sitemap: save `dist/sitemap-index.xml`.
- [ ] A few representative rendered pages saved as HTML: homepage, one blog post **with math (`$$`/KaTeX) + mermaid + PlantUML + code blocks**, one MDX page, resume page, gallery page.
- [ ] Full-page screenshots (homepage + post page, desktop + mobile) for visual diffing.
- [ ] `pnpm test` green (record snapshot list).

---

## 3. Work plan

### Phase 1 — Dependency upgrades

```bash
pnpm dlx @astrojs/upgrade          # upgrades astro + official integrations together
```

Then manually reconcile (the CLI may not cover everything):

| Package | Action |
|---|---|
| `astro` | `6.3.8` → latest `7.x` (keep exact pin, matching current style) |
| `@astrojs/mdx` | latest v7-compatible major |
| `@astrojs/react` | latest v7-compatible major |
| `@astrojs/sitemap` | latest v7-compatible major |
| `@astrojs/rss` | bump if peer range requires |
| `@astrojs/check` | latest (required by `astro check` in `build` script) |
| `@astrojs/markdown-remark` | **new dependency** — required to keep the unified pipeline (§3.2) |
| `astro-mermaid` | check releases/changelog for v7 support; if unsupported, pin and open/track an upstream issue, or vendor the integration |
| `vite-plugin-glsl` | verify Vite 8 compatibility; if broken, look for a Rolldown-compatible fork or inline a minimal plugin |
| `vitest`, `jsdom`, `happy-dom`, `@testing-library/react` | bump Vitest to the major that supports Vite 8 (§3.5) |

- [ ] `pnpm install` clean, no peer-dep warnings on `astro@7`.
- [ ] Commit lockfile separately for reviewability.

### Phase 2 — Config migration (`astro.config.mjs`)

#### 3.1 Nothing to remove
No `experimental` flags, no `@astrojs/db`, no legacy flags in the current config — the "removed/deprecated config" part of the guide is a no-op here. `src/fetch.ts` doesn't exist, so Advanced Routing's reserved filename is not a conflict.

#### 3.2 Keep the unified Markdown pipeline (REQUIRED)

v7's default pipeline (Sätteri) does not run remark/rehype plugins. This project depends on:

- `remark-math` + `rehype-katex` → math rendering in posts
- `rehype-external-links` → `_blank`/`noopener` on outbound links
- `rehypeCloudinary` (`packages/utils/cloudinary.ts`) → image URL rewriting
- `remark-attributes` → `{.class}` attribute syntax in Markdown

Therefore add the explicit processor **in the same change as the version bump**:

```js
import { unified } from "@astrojs/markdown-remark";

export default defineConfig({
  // ...
  markdown: {
    processor: unified(),
    remarkPlugins: [remarkAttributes, remarkMath],
    rehypePlugins: [
      rehypeCloudinary,
      [rehypeKatex, { strict: false }],
      [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] }],
    ],
    shikiConfig: { /* unchanged */ },
  },
});
```

Notes:
- `markdown.remarkPlugins` / `rehypePlugins` are deprecated-but-functional in v7 and now **require** `@astrojs/markdown-remark` installed — passing them through `unified({...})` is the more future-proof form; prefer it if it works with `extendMarkdownConfig: true` for MDX, otherwise keep the `markdown.*` form.
- **Verify `shikiConfig`** (custom `plantuml` grammar from `shiki-plantuml` local package + `bundledLanguages`) still loads under v7; this is a local `file:` package and a prime breakage candidate. If the grammar API changed, adapt `packages/shiki-plantuml`.
- Later (optional, post-upgrade follow-up): evaluate migrating `remark-math`/`rehype-katex` to Sätteri's built-in `math` feature and porting the rehype plugins to Sätteri's plugin API for build-speed gains. Out of scope for the upgrade itself.

#### 3.3 `compressHTML` decision

v7 default is `compressHTML: 'jsx'` (JSX whitespace rules). Two options:

- **Option A (recommended):** accept the new default and fix spacing with `{" "}` where inline elements adjoin (Phase 4 audit). Keeps the smaller HTML output and future-default alignment.
- **Option B (safe fallback):** set `compressHTML: true` in config to restore v6 behavior; revisit later.

Start with B applied in a **revertible single-line commit** only if Phase 4 finds widespread breakage; otherwise stay on A.

#### 3.4 Vite 8 / Rolldown validation

Current `vite` config block must be re-validated:

- [ ] `vite-plugin-glsl` still transforms `.glsl` imports in the WebGL islands (ParticleHero / three.js) — build a page that imports shaders and inspect the client bundle.
- [ ] `build.rollupOptions.treeshake.moduleSideEffects: "no-external"` — Vite 8's compat layer converts `rollupOptions`; confirm the tabler-icons/lucide tree-shaking fix still holds (compare largest bundles vs baseline; `tabler-icons-react` must stay well under 2.2 MB).
- [ ] `optimizeDeps.exclude` for `@dimforge/rapier3d-compat` / `@react-three/rapier` and the `pnpm.overrides` pin still produce a working dev server (Rapier WASM init must not be prebundled — see `.agents/skills/webgl-components`).
- [ ] `resolve.alias` for `react-plock` (points at a concrete ESM dist file) and `onnxruntime-node` → `src/empty-module.js` still resolve under Rolldown.
- [ ] `ssr.noExternal: ["react-plock"]` still honored.

#### 3.5 Test tooling

- [ ] Upgrade `vitest` to the major paired with Vite 8 (check vitest release notes; expect 4.x). Align the config with `.agents/skills/vitest-testing/SKILL.md`.
- [ ] Run `pnpm test`, `pnpm test:unit` — fix config/API breakages (e.g. `vi.mock` hoisting changes, workspace config format).

### Phase 3 — Rust compiler strictness fixes

Run `pnpm build` and triage. Expected error classes and where to look:

1. **Unclosed tags now error** — compiler output names the file/line. Likely spots: hand-written `.astro` in `src/components/`, `packages/layouts/`, `packages/header/`, `packages/heat/`.
2. **Invalid HTML nesting no longer corrected** — the compiler won't reflow invalid markup anymore; the *browser* then re-parses it and layout can silently change even without build errors. Grep for classic offenders:
   - `<div>`/`<table>`/`<ul>`/headings nested inside `<p>` (in `.astro` templates **and** in Markdown content, since raw HTML in `.md` is affected too).
   - [ ] Fix by changing the container element (e.g. `<p>` → `<div>`) rather than relying on parser correction.
3. **CSS output differences (cosmetic, but verify)**: scoped styles now go through Lightning CSS — named colors may serialize to hex (`rebeccapurple` → `#639`), `url()` quoting may change. Only action: confirm no tests/snapshots do exact CSS string matching, and spot-check scoped-style isolation in `packages/*` CSS modules.
4. [ ] After fixes: full `pnpm build` green + `astro check` clean.

### Phase 4 — Whitespace / inline-element audit (new `compressHTML: 'jsx'` default)

JSX whitespace rules drop the "significant space" between inline elements that v6 preserved. Audit, in priority order:

- [ ] Navigation / breadcrumb / tag-list / pagination components where inline items are separated only by newlines (`packages/header/`, footer, post metadata rows).
- [ ] Inline prose patterns in `.astro` layouts (e.g. `Posted <span>date</span><em>category</em>`).
- [ ] Markdown content is *not* affected (Markdown paragraph text keeps its spaces); only `.astro` template markup is. MDX inline JSX **is** affected — spot-check MDX posts.
- [ ] Visual-diff the Phase 0 screenshots vs new build; fix with explicit `{" "}` between inline elements.
- [ ] Re-check `packages/heat` and homepage islands for collapsed-space regressions around badges/chips.

### Phase 5 — Functional verification

- [ ] `pnpm build` (includes `astro check` + resume PDF generation `packages/resume/generate-pdfs.mjs`) — green, and **faster than baseline** (record the number).
- [ ] `pnpm test` + `pnpm test:unit` — green.
- [ ] `pnpm dev` — server boots; WebGL islands (ParticleHero, WorldMap/maplibre, Rapier) hydrate without errors; mermaid diagrams render; PlantUML code blocks highlight.
- [ ] Content spot checks on the built output:
  - [ ] KaTeX math renders in a math-heavy post.
  - [ ] External links open in new tab with `rel` attrs.
  - [ ] Cloudinary image URLs rewritten.
  - [ ] `dist/rss.xml` valid and unchanged vs baseline.
  - [ ] `dist/sitemap-index.xml` unchanged.
  - [ ] Search index data (minisearch) intact.
- [ ] Bundle-size regression check vs Phase 0 baseline (guard the `website-optimization-plan.md` wins).
- [ ] Lighthouse / CWV spot check on homepage + one post (no regressions; ideally neutral-to-better given smaller HTML from `compressHTML: 'jsx'`).
- [ ] Deploy preview (Vercel) and smoke-test production routes before merging.

### Phase 6 — Merge

- [ ] Squash-merge `astro7-upgrade` → `master` after preview deploy approval.
- [ ] Update `AGENTS.md` / `.agents/skills/astro-build/SKILL.md` notes if any project-specific conventions changed (e.g. unified processor note, whitespace `{" "}` convention).
- [ ] Tag or record the Astro 7 build-time number in this doc's §8 (results).

---

## 4. Post-upgrade opportunities (optional, separate PRs)

Not required for v7, but unlocked by it:

1. **Advanced Routing** (`src/fetch.ts`) — currently no need; static output has no request pipeline. Revisit only if moving to SSR/on-demand rendering.
2. **Route caching + Vercel CDN cache provider** — only relevant if/when the blog adopts SSR or live content collections; static output gains nothing.
3. **Sätteri migration for Markdown** — port `remark-math` → built-in `features.math`, and rehype plugins → Sätteri plugins, to actually capture the Rust Markdown pipeline's build-time win (currently we intentionally stay on unified, so v7's Markdown speedup mostly doesn't apply to us).
4. **`astro dev --background` / JSON logging** — nice for agent workflows; zero-risk adoption.
5. **Background-render benchmarks** — re-measure the homepage HTML size from `website-optimization-plan.md`; the new compiler + `compressHTML: 'jsx'` may shave payload for free.

---

## 5. Risk matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| remark/rehype plugins silently ignored (forgot `unified()`) | Med | High (broken math/links/images) | Add processor in same commit as bump; Phase 5 content checks are mandatory |
| `astro-mermaid` incompatible with v7 | Med | Med | Verify before merge; fallback: pin, fork, or replace with a local rehype/integration shim |
| `shiki-plantuml` grammar API break | Low–Med | Med | Phase 2 verification; local `file:` package means we can fix in-repo |
| Inline-element spaces collapse site-wide | High | Low–Med | Phase 4 audit + visual diffs; `compressHTML: true` as one-line fallback |
| Build errors from unclosed tags | Med | Low (compiler points at file/line) | Phase 3 triage; mechanical fixes |
| Rapier/three/maplibre islands break under Vite 8 | Low–Med | High (dev + runtime) | Phase 3.4 checklist; webgl-components skill troubleshooting |
| Vitest/Vite mismatch breaks test suite | Med | Low | Upgrade Vitest in lockstep (Phase 3.5) |
| Tree-shaking regression re-inflates icon bundles | Low | Med | Bundle-size check vs baseline (Phase 5) |

## 6. Rollback

Everything happens on the `astro7-upgrade` branch; `master` is untouched until Phase 6. Rollback = abandon branch. If issues surface **after** merge, revert the merge commit; config fallback `compressHTML: true` and the unified Markdown processor are independent, individually revertible changes.

---

## 7. Estimated effort

| Phase | Effort |
|---|---|
| 0 Baseline | 0.5 h |
| 1 Dependency upgrades | 0.5–1 h (+ unknowns: astro-mermaid, glsl plugin) |
| 2 Config migration | 1 h |
| 3 Compiler strictness fixes | 1–3 h (depends on content hygiene) |
| 4 Whitespace audit | 1–2 h |
| 5 Verification | 1–2 h |
| **Total** | **~0.5–1.5 days** |

---

## 8. Results

_(to be filled after the upgrade)_
