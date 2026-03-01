# AGENTS.md - Agent Coding Guidelines

This document provides guidelines for agents working on this codebase.

## Project skills

When working with Astro (pages, components, content collections, or framework integrations), use the project skill for authoritative patterns and links to [astro.build](https://docs.astro.build):

- **Astro**: [.agent/skills/astro-build/SKILL.md](.agent/skills/astro-build/SKILL.md) — pages, routing, `.astro` components, content collections, React/framework components, endpoints.

When working with Mantine UI (React components from `@mantine/core`, `@mantine/hooks`, etc.), use the project skill for Mantine patterns and this repo’s Astro adapt layer:

- **Mantine UI**: [.agent/skills/mantine-ui/SKILL.md](.agent/skills/mantine-ui/SKILL.md) — Mantine usage, **CustomMantineProvider** from `@/src/stores/CustomMantineProvider` as the adapt layer (Mantine does not support Astro natively; wrap each React island that uses Mantine with this provider).

## Project Overview

This is an Astro-based blog with React components, using TypeScript, Tailwind CSS, and various UI libraries (Mantine, shadcn/ui).

## Code Style Guidelines

### TypeScript
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
export const $derived = computed($state, v => transform(v));
```

### Styling
- **Tailwind CSS** for utility classes
- **Mantine** for UI components — wrap any React component that uses Mantine with `CustomMantineProvider` from `@/src/stores/CustomMantineProvider` (see [.agent/skills/mantine-ui/SKILL.md](.agent/skills/mantine-ui/SKILL.md))
- **shadcn/ui** components in `@/packages/shadcn/`
- **CSS Modules** for component-specific styles

### Directory Structure
```
src/
├── components/     # React/Astro components
├── pages/          # Astro pages and API routes
├── stores/         # Nanostores state management
├── content/        # Blog content (MDX)
packages/           # Workspace packages
├── shadcn/         # UI component library
├── react/          # Shared React utilities
├── utils/          # Shared utilities
├── pv-counter/     # Cloudflare Worker for view counts
└── ...
```
