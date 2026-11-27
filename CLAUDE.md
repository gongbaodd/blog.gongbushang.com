# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The import above pulls in this repo's `AGENTS.md`, which is the primary source of coding guidelines (project skills in `.agents/skills/`, code style, naming conventions, directory structure). Read it. Everything below is Claude-specific: commands and architecture context not covered there.

## Commands

Package manager is **pnpm** (`packageManager: pnpm@10.33.2` in package.json); use `pnpm`, not `npm`/`yarn`. `pnpm-workspace.yaml` lists `packages/*` and `apps/*`. The apps are `web` (`apps/web`, public site) and `admin` (`apps/admin`, Docker admin). Use `pnpm --filter web <script>` or `pnpm --filter admin <script>`. Full guide: `.agents/skills/emdash/SKILL.md`.

```bash
pnpm install
pnpm --filter web dev
pnpm --filter web build           # runs derive first (writes Supabase derived.* unless DERIVE_READONLY=1)
pnpm --filter web parity          # URL parity with apps/web/tests/legacy-urls.txt
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter admin dev           # host only, never inside a container
pnpm --filter admin check:secrets
pnpm --filter admin smoke         # local Supabase only
pnpm db:start                     # local Supabase
pnpm admin:local                  # host-native admin on local DB (production edits use apps/admin, SEC-07)
pnpm test                         # every workspace's test script, plus node --test scripts/*.test.mjs
pnpm lint / pnpm fmt              # oxlint / oxfmt
pnpm umap:build                   # cargo build --release for packages/umap (derive reuses the old layout without it)
pnpm clean                        # remove regenerable build output (dist, dist-e2e, .astro, .wrangler) at root and apps/*; clean:dry to preview
```

Run a single test file or case with vitest from the app, e.g. `pnpm --filter web exec vitest run src/lib/seo.test.ts` or `pnpm --filter web exec vitest run -t "test name"`. See `.agents/skills/vitest-testing/SKILL.md`.

Environments are `local` and `production` only. The public site is noindex unless `PUBLIC_SITE_LIVE=true`, exact lowercase only (CUT-1).

## Architecture

**Content lives in EmDash** (Supabase Postgres). There is no content submodule and no markdown in the repo. Posts, podcasts and gallery are EmDash collections (`apps/web/scripts/schema/apply.mjs`); edit them in the admin (`apps/admin`), not in files.

**Derive** (`apps/web/scripts/derive/`) runs before every `astro build`. It reads EmDash read-only, computes embeddings (Workers AI), UMAP (Rust binary from `packages/umap`), relates, cover colours, geocodes and gallery traces, caches them in the Supabase `derived` schema, and writes the build inputs `apps/web/src/generated/*.json` and `apps/web/public/api/**` (git-ignored). Read them through `apps/web/src/lib/legacy-data.ts`; prerender runs in workerd and cannot read the disk.

**Rendering**: `output: "server"` with `@astrojs/cloudflare`; almost every page and API route is prerendered, and `scripts/check-static-routes.mjs` fails the build on a route that is not. The Worker (`src/worker.ts`) answers `/_emdash/*` with 404 (the admin is too heavy for Workers Free CPU).

**React islands**: hydrated per component via client directives (see the astro-build skill). Cross-island state goes through nanostores in `apps/web/src/stores/`. Mantine islands are wrapped in `CustomMantineProvider` (mantine-ui skill).

**WebGL/Three.js/maplibre islands** (`src/particle-hero`, `src/map`, `src/bits/Backgrounds`) use `ReactErrorBoundary` and the Vite config in `apps/web/astro.config.mjs` (`onnxruntime-node` aliased to an empty module, `react-plock` bundled). See `.agents/skills/webgl-components/SKILL.md` before touching them.

**Polyglot bits**: a Cargo workspace (`Cargo.toml`, members `packages/umap`, `packages/rag-umap`) builds the UMAP binary derive calls. `packages/shiki-plantuml` is a git submodule used by the Markdown renderer; initialise it before `pnpm install`, or the install prunes its entries from the lockfile.
