# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above pulls in this repo's `AGENTS.md`, which is the primary source of coding guidelines (project skills in `.agents/skills/`, code style, naming conventions, directory structure). Read it. Everything below is Claude-specific: commands and architecture context not covered there.

## Commands

Package manager is **pnpm** (`packageManager: pnpm@10.33.2` in package.json); use `pnpm`, not `npm`/`yarn`.

```bash
pnpm install          # install deps (workspaces: packages/*)
pnpm dev              # astro dev server at localhost:4321
pnpm build            # astro check && astro build -> ./dist
pnpm preview           # preview production build locally

pnpm test             # vitest run (all suites incl. .test.tsx)
pnpm test:unit        # vitest run, excludes **/*.test.tsx
pnpm test:watch       # vitest watch mode
```

Run a single test file or case with vitest directly, e.g. `pnpm vitest run packages/utils/foo.test.ts` or `pnpm vitest run -t "test name"`. See `.agents/skills/vitest-testing/SKILL.md` for the testing API/config.

Content and data-pipeline scripts (see `.agents/skills/generated-content/SKILL.md`):

```bash
pnpm content:prepare   # regenerate post metadata/covers (content-prepare package)
pnpm fetch:podcast     # fetch-podcast package
pnpm gallery:prepare   # prepare-gallery package
pnpm umap:build        # cargo build --release for packages/umap (Rust)
pnpm umap:test         # cargo test -p umap
pnpm embedding:sync    # uv sync (Python embedding package)
pnpm depth:sync        # uv sync (Python depth-estimation package)
```

`pnpm clone` re-pulls the blog content submodule source into `src/content/_docs` via `packages/scripts/clone.sh`.

## Architecture

**Polyglot monorepo.** pnpm workspaces (`packages/*`) hold JS/TS packages; a Cargo workspace (`Cargo.toml`, members `packages/rag-umap`, `packages/umap`) holds Rust UMAP code; a uv workspace (`pyproject.toml`, members `packages/embedding`, `packages/depth-estimation`) holds Python. The Astro app in `src/` is the consumer of all three — generated JSON/artifacts from the Rust/Python/content-prepare pipelines land under `src/content/generated/` and are read by TS helpers in `packages/utils/` (paths centralized in `packages/consts/config.js`).

**`src/content` is a separate git submodule** (`.gitmodules` → `gongbaodd/gongbaodd.github.io`), containing the actual `_docs` (markdown posts) and `_gallery` source content plus the `generated/` build artifacts. When content looks missing or stale, check submodule status before assuming a code bug.

**Content collections**: configured in `src/content.config.ts` (not inside the submodule). Pages under `src/pages/` (file-based routing, including dynamic segments like `[category]/[year]`, `[filter].astro`, `world/[city].astro`) query these collections; `src/pages/api/*` are Astro endpoints backing client-side fetches (cards, category, tag, series, year, heatmap, podcast, posts, world).

**Rendering**: `output: "static"` with the Vercel adapter in ISR mode (`astro.config.mjs`) — most pages prerender; only specific endpoints opt into on-request behavior.

**React islands**: hydrated per-component via client directives (`client:load`/`client:visible`/etc., see astro-build skill). Global/cross-island state goes through nanostores in `src/stores/`. Components using Mantine must be wrapped in `CustomMantineProvider` (`src/stores/CustomMantineProvider`) since Mantine has no native Astro support — see `.agents/skills/mantine-ui/SKILL.md`.

**WebGL/Three.js/Rapier/maplibre components** (`src/bits/Backgrounds`, particle-hero, map, heat, etc.) need error boundaries and rely on special Vite config in `astro.config.mjs` (Rapier WASM exclusions, `onnxruntime-node` aliased to an empty module, `react-plock` forced to bundle) — see `.agents/skills/webgl-components/SKILL.md` before touching these.

**Note**: `packages/pv-counter` (the view-count Cloudflare Worker referenced in `AGENTS.md` and still excluded in `tsconfig.json`) was removed from this repo (see git history: "remove pvcounter and llm") — don't assume it exists on disk.
