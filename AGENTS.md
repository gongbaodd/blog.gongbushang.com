# AGENTS.md - Agent Coding Guidelines

This document provides guidelines for agents working on this codebase.

## Project skills

Start with the EmDash skill for anything in `apps/web`, `apps/admin`, `supabase/`, the derive pipeline, environments, or the Supabase RLS lockdown:

- **EmDash apps**: [.agents/skills/emdash/SKILL.md](.agents/skills/emdash/SKILL.md) — `apps/web` on Cloudflare with Hyperdrive, `derive` writing the `derived` schema and the generated build data, `apps/admin` (Docker, Cloudflare Access), `local`/`production` environments, SEC-01 lockdown and role order, runbook index.

When working with Astro in `apps/web` (pages, routing, `.astro` components, React islands, endpoints):

- **Astro**: [.agents/skills/astro-build/SKILL.md](.agents/skills/astro-build/SKILL.md) — server output with prerendered pages, EmDash instead of content collections, client directives, links to [docs.astro.build](https://docs.astro.build).

When working with Mantine UI (React components from `@mantine/core`, `@mantine/hooks`, etc.):

- **Mantine UI**: [.agents/skills/mantine-ui/SKILL.md](.agents/skills/mantine-ui/SKILL.md) — **CustomMantineProvider** (`apps/web/src/stores/CustomMantineProvider.tsx`, imported as `@/src/stores/CustomMantineProvider`) is the adapt layer. Mantine does not support Astro natively, so wrap each React island that uses Mantine with this provider.

When adding or editing React islands that use WebGL, Three.js or maplibre canvas:

- **WebGL components**: [.agents/skills/webgl-components/SKILL.md](.agents/skills/webgl-components/SKILL.md) — `ReactErrorBoundary` around WebGL subtrees, the Vite config in `apps/web/astro.config.mjs`, dev cache troubleshooting.

When writing or running tests:

- **Vitest (testing)**: [.agents/skills/vitest-testing/SKILL.md](.agents/skills/vitest-testing/SKILL.md) — Vitest setup, test API (`test`/`describe`/`expect`), config (Vite shared), CLI, mocking (`vi`), snapshots, coverage.

When reading or writing Linear issues (team `GON`):

- **Linear**: [.agents/skills/linear/SKILL.md](.agents/skills/linear/SKILL.md) — every issue carries exactly one `Agent` label (`claude-opus-5.5`, `claude-sonnet-5.5`, `agy-neon-4`, `agy-hydrogen-4`, `human`) naming who handles it; work only your own label, hand off by relabelling with a comment; start every comment you post with your own label, e.g. `**[claude-opus-5.5]**`.

## Project Overview

The site is [growgen.xyz](https://growgen.xyz), a personal blog built on the EmDash CMS (Astro). It went live on 2026-11-27 (CUT-1); the old `src/` Astro site, its packages and the content submodule were deleted in CUT-2.

- `apps/web`: the public site. Astro + React islands, TypeScript, Tailwind CSS, Mantine and a few shadcn/ui components, on Cloudflare Workers with Hyperdrive to Supabase Postgres.
- `apps/admin`: the EmDash admin, a Dockerized Node server behind Cloudflare Access.
- `supabase/`: migrations and roles for the EmDash and `derived` schemas.

## Code Style Guidelines

### TypeScript

- `apps/web/tsconfig.json` extends `astro/tsconfigs/base`; `apps/admin` has its own `tsconfig.json`
- Path alias in `apps/web`: `@/*` maps to the `apps/web` root (so `@/src/...`)
- JSX: `react-jsx` with `react` import source
- Lint and format from the repo root: `pnpm lint` (oxlint), `pnpm fmt` (oxfmt)

### Naming Conventions

- **Components**: PascalCase (e.g., `ViewCount.tsx`, `PostCard.tsx`)
- **Files**: kebab-case for non-component files (e.g., `search.ts`, `pv.ts`)
- **CSS Modules**: `.module.css` suffix (e.g., `ParticleHero.module.css`)
- **Interfaces**: PascalCase with `I` prefix for props (e.g., `IViewCountProps`)

### Imports

- Order: external libs -> internal modules -> relative paths
- Use the path alias `@/src/...` inside `apps/web`
- Example:

```typescript
import { useStore } from "@nanostores/react";
import { Group, Flex, Text } from "@mantine/core";
import { $pvMap } from "@/src/stores/pv";
import classes from "./ViewCount.module.css";
```

### React Components

- Use functional components with TypeScript interfaces for props
- Default export for page components, named exports for reusable components
- Use CSS modules for component-scoped styles

### State Management

- Use **nanostores** for global state (atom, map, computed)
- Common stores in `apps/web/src/stores/`
- Example pattern:

```typescript
import { atom, map, computed } from "nanostores";
import { useStore } from "@nanostores/react";

export const $state = map<{ key: value }>({ key: initialValue });
export const $derived = computed($state, (v) => transform(v));
```

### Styling

- **Tailwind CSS** (v3, `apps/web/tailwind.config.mjs`) for utility classes
- **Mantine** for UI components — wrap any React component that uses Mantine with `CustomMantineProvider` from `@/src/stores/CustomMantineProvider` (see [.agents/skills/mantine-ui/SKILL.md](.agents/skills/mantine-ui/SKILL.md))
- **shadcn/ui** components in `apps/web/src/shadcn/`
- **CSS Modules** for component-specific styles

### Directory Structure

```
apps/                 # pnpm workspace apps (pnpm-workspace.yaml: packages/*, apps/*)
├── web/              # public site (Astro on Cloudflare Workers, Hyperdrive)
│   ├── src/pages/    # routes and API endpoints (URLs must match tests/legacy-urls.txt)
│   ├── src/stores/   # nanostores, CustomMantineProvider
│   ├── src/analytics/# Mixpanel
│   ├── src/lib/      # EmDash queries, listing, markdown, SEO, lockdown
│   ├── src/generated/# derive output (git-ignored)
│   └── scripts/      # derive/, schema/, admin/, cutover/, guards/, ...
├── admin/            # Dockerized Node EmDash admin (Cloudflare Access)
packages/             # Rust UMAP (umap, rag-umap; Cargo workspace) and the shiki-plantuml submodule
supabase/             # migrations, roles (SEC-01 lockdown, SEC-11 roles), local config
scripts/              # repo-level tooling: clean, prune-worktrees, CI check guards
docs/plan/emdash/     # runbooks, reports, knowledge base, retrospectives
```

## Mixpanel analytics

- Code lives in `apps/web/src/analytics/` (`index.ts` API, `events.ts` typed event map, `env.ts` gate, `outbound.ts`, `read-depth.ts`, `MixpanelHead.astro` in `src/components/BaseHead.astro`, `ConsentBanner.astro` in `src/layouts/Global.astro`). Plan: `docs/plan/mixpanel-analytics-plan.md`.
- Loads only on a live build (`PUBLIC_SITE_LIVE=true`, `env.ts`) with a token. Config via env: `PUBLIC_MIXPANEL_TOKEN` (empty → nothing loads), `PUBLIC_MIXPANEL_API_HOST` (default `https://api-eu.mixpanel.com`), `PUBLIC_MIXPANEL_DEBUG`.
- Consent is opt-in: Mixpanel inits opted out; only the banner / `/privacy` controls call `optIn()`. Choice is stored in localStorage `growgen_analytics_consent`. Never call `opt_in_tracking` elsewhere.
- Track only via `track(name, props)` from `@/src/analytics`; add new events to `events.ts` first. Names: `object_verb` snake_case (e.g. `post_read`, `search_performed`), snake_case properties, no `$`/`mp_` prefixes, no dynamic event names, numbers unquoted, omit missing values (null/"" are stripped).
- Reuse existing events/properties before adding new ones. Only discrete user actions — never inside WebGL/`useFrame`/map render loops.
- No user accounts on this site: no `identify`, `people.set`, or `reset`.
- Tests: `pnpm --filter web exec vitest run src/analytics`; e2e `pnpm --filter web test:e2e:analytics-on` (token build) and `@analytics-off` in `pnpm --filter web test:e2e`.
