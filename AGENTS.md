# AGENTS.md - Agent Coding Guidelines

This document provides guidelines for agents working on this codebase.

## Project skills

When working with Astro (pages, components, content collections, or framework integrations), use the project skill for authoritative patterns and links to [astro.build](https://docs.astro.build):

- **Astro**: [.agents/skills/astro-build/SKILL.md](.agents/skills/astro-build/SKILL.md) — pages, routing, `.astro` components, content collections, React/framework components, endpoints.

When working with Mantine UI (React components from `@mantine/core`, `@mantine/hooks`, etc.), use the project skill for Mantine patterns and this repo’s Astro adapt layer:

- **Mantine UI**: [.agents/skills/mantine-ui/SKILL.md](.agents/skills/mantine-ui/SKILL.md) — Mantine usage, **CustomMantineProvider** from `@/src/stores/CustomMantineProvider` as the adapt layer (Mantine does not support Astro natively; wrap each React island that uses Mantine with this provider).

When writing or running tests, use the project skill for Vitest:

- **Vitest (testing)**: [.agents/skills/vitest-testing/SKILL.md](.agents/skills/vitest-testing/SKILL.md) — Vitest setup, test API (`test`/`describe`/`expect`), config (Vite shared), CLI, mocking (`vi`), snapshots, coverage.

When working with generated post covers, metadata, podcast data, embeddings, UMAP, or the `content-prepare` / `fetch-podcast` pipelines:

- **Generated content**: [.agents/skills/generated-content/SKILL.md](.agents/skills/generated-content/SKILL.md) — paths in `packages/consts/config.js`, reader functions in `packages/utils/post.ts` and `packages/utils/podcast.ts`, SVG trace layout under `src/content/generated/`.
- **Metadata embeddings + UMAP**: `packages/metadata-embedding` — post/podcast embedding text builders, `embedFromText`, `applyBlogUmapCorpus` (shared `metadata/.umap-state.json`).

When adding or editing React islands that use WebGL, Three.js, Rapier physics, or maplibre/mapbox canvas:

- **WebGL components**: [.agents/skills/webgl-components/SKILL.md](.agents/skills/webgl-components/SKILL.md) — error boundaries around WebGL subtrees, Rapier WASM Vite config in `astro.config.mjs`, pnpm overrides, dev cache troubleshooting.

When working on the EmDash apps (`apps/web`, `apps/admin`, `supabase/`, the derive pipeline, environments, or the Supabase RLS lockdown):

- **EmDash apps**: [.agents/skills/emdash/SKILL.md](.agents/skills/emdash/SKILL.md) — `apps/web` on Cloudflare with Hyperdrive, `derive` writing the `derived` schema, `apps/admin` (Docker, Cloudflare Access), `local`/`production` environments, SEC-01 lockdown and role order, runbook index.

When reading or writing Linear issues (team `GON`):

- **Linear**: [.agents/skills/linear/SKILL.md](.agents/skills/linear/SKILL.md) — every issue carries exactly one `Agent` label (`claude-opus-5.5`, `claude-sonnet-5.5`, `agy-neon-4`, `agy-hydrogen-4`, `human`) naming who handles it; work only your own label, hand off by relabelling with a comment.

## Project Overview

The repo has two sites. The EmDash apps (`apps/web`, `apps/admin`) are the migration target. The `src/` Astro site is **legacy until CUT-2**; the notes below that refer to `src/` describe it.

Legacy site (`src/`): an Astro-based blog with React components, using TypeScript, Tailwind CSS, and various UI libraries (Mantine, shadcn/ui).

## Code Style Guidelines

### TypeScript (legacy `src/` notes until CUT-2; the EmDash apps follow `.agents/skills/emdash/SKILL.md`)

- Uses `astro/tsconfigs/strict` with additional options in `tsconfig.json`
- Path aliases: `@/*` maps to project root
- JSX: `react-jsx` with `react` import source

### Naming Conventions

- **Components**: PascalCase (e.g., `ViewCount.tsx`, `Bento.tsx`)
- **Files**: kebab-case for non-component files (e.g., `search.ts`, `pv.ts`)
- **CSS Modules**: `.module.css` suffix (e.g., `ViewCount.module.css`)
- **Interfaces**: PascalCase with `I` prefix for props (e.g., `IViewCountProps`)

### Imports

- Order: external libs -> internal packages -> relative paths
- Use path aliases: `@/packages/...` for workspace packages
- Example:

```typescript
import { useStore } from "@nanostores/react";
import { Group, Flex, Text } from "@mantine/core";
import { $pvMap } from "../stores/pv";
import classes from "./ViewCount.module.css";
```

### React Components

- Use functional components with TypeScript interfaces for props
- Default export for page components, named exports for reusable components
- Use CSS modules for component-scoped styles

### State Management

- Use **nanostores** for global state (atom, map, computed)
- Common stores in `src/stores/`
- Example pattern:

```typescript
import { atom, map, computed } from "nanostores";
import { useStore } from "@nanostores/react";

export const $state = map<{ key: value }>({ key: initialValue });
export const $derived = computed($state, (v) => transform(v));
```

### Styling

- **Tailwind CSS** for utility classes
- **Mantine** for UI components — wrap any React component that uses Mantine with `CustomMantineProvider` from `@/src/stores/CustomMantineProvider` (see [.agents/skills/mantine-ui/SKILL.md](.agents/skills/mantine-ui/SKILL.md))
- **shadcn/ui** components in `@/packages/shadcn/`
- **CSS Modules** for component-specific styles

### Directory Structure

```
apps/               # pnpm workspace apps (pnpm-workspace.yaml: packages/*, apps/*)
├── web/            # EmDash public site (Astro on Cloudflare Workers, Hyperdrive); derive pipeline in scripts/derive/
├── admin/          # Dockerized Node EmDash admin (Cloudflare Access)
supabase/           # Supabase project: migrations, roles (SEC-01 lockdown, SEC-11 roles), local config
packages/           # Workspace packages
├── shadcn/         # UI component library
├── react/          # Shared React utilities
├── utils/          # Shared utilities
└── ...
src/                # LEGACY Astro site, until CUT-2
├── components/     # React/Astro components
├── pages/          # Astro pages and API routes
├── stores/         # Nanostores state management
├── content/        # Blog content submodule (_docs source + generated/ artifacts)
```

## Mixpanel analytics

- Code lives in `packages/analytics/` (`index.ts` API, `events.ts` typed event map, `outbound.ts`, `read-depth.ts`, `MixpanelHead.astro` in `BaseHead`, `ConsentBanner.astro` in `Global.astro`). Plan: `docs/plan/mixpanel-analytics-plan.md`.
- Config via env: `PUBLIC_MIXPANEL_TOKEN` (empty → nothing loads), `PUBLIC_MIXPANEL_API_HOST` (default `https://api-eu.mixpanel.com`), `PUBLIC_MIXPANEL_DEBUG`.
- Consent is opt-in: Mixpanel inits opted out; only the banner / `/privacy` controls call `optIn()`. Choice is stored in localStorage `growgen_analytics_consent`. Never call `opt_in_tracking` elsewhere.
- Track only via `track(name, props)` from `@/packages/analytics`; add new events to `events.ts` first. Names: `object_verb` snake_case (e.g. `post_read`, `search_performed`), snake_case properties, no `$`/`mp_` prefixes, no dynamic event names, numbers unquoted, omit missing values (null/"" are stripped).
- Reuse existing events/properties before adding new ones. Only discrete user actions — never inside WebGL/`useFrame`/map render loops.
- No user accounts on this site: no `identify`, `people.set`, or `reset`.
- Tests: `pnpm vitest run packages/analytics`; e2e `pnpm test:e2e:analytics-on` (token build) and `@analytics-off` in `pnpm test:e2e`.
