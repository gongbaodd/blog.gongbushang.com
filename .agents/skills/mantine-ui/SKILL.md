---
name: mantine-ui
description: Use Mantine UI (mantine.dev) patterns and this project's Astro adapt layer when working with Mantine components. Use when adding or editing React components that use @mantine/core, @mantine/hooks, or other @mantine/* packages, or when styling/theming with Mantine.
---

# Mantine UI in This Project

[Mantine](https://mantine.dev) is a React component library (120+ components, 70+ hooks). It does **not** officially support Astro. This project uses a custom adapt layer so Mantine works inside Astro’s React islands.

## Official docs

- **Docs**: [mantine.dev](https://mantine.dev)
- **Getting started**: [Getting started](https://mantine.dev/getting-started/)
- **MantineProvider**: [MantineProvider](https://mantine.dev/theming/mantine-provider/)
- **Components**: [Core components](https://mantine.dev/core/button/), [Hooks](https://mantine.dev/hooks/package/)

## Astro adapt layer: CustomMantineProvider

Mantine requires a React context from `MantineProvider`. In a single React app you wrap the root once; in Astro, each React island is a separate tree, so **every island that uses Mantine must be wrapped in a provider**.

This project uses **`CustomMantineProvider`** from `@/src/stores/CustomMantineProvider` as that adapt layer.

### Rule: wrap Mantine usage in CustomMantineProvider

Any React component that renders Mantine components (from `@mantine/core`, `@mantine/hooks`, etc.) must wrap that usage in `CustomMantineProvider`:

```tsx
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Group, Text } from "@mantine/core";

export default function MyComponent() {
  return (
    <CustomMantineProvider>
      <Group>
        <Text>Hello from Mantine</Text>
      </Group>
    </CustomMantineProvider>
  );
}
```

- **Path**: Use the project alias `@/src/stores/CustomMantineProvider` (or a relative path from the file).
- **Scope**: Wrap only the subtree that uses Mantine (e.g. the returned JSX of the component). Do not wrap the whole page in Astro.
- **One provider per island**: Each Astro-included React component that uses Mantine should have its own `CustomMantineProvider` around its Mantine UI.

### What CustomMantineProvider does

It wraps `MantineProvider` from `@mantine/core` with `defaultColorScheme="auto"`. Theme and color-scheme behavior are controlled there; do not add a second `MantineProvider` inside it unless the skill or project docs say otherwise.

## Mantine usage summary

- **Packages**: `@mantine/core` (components), `@mantine/hooks` (hooks). Optional: `@mantine/form`, `@mantine/dates`, `@mantine/notifications`, etc.
- **Styles**: Project should already import `@mantine/core/styles.css` at the app root (e.g. layout). Extra packages may need their own style imports (see [Mantine getting started](https://mantine.dev/getting-started/)).
- **Theming**: Theme override is typically done via `MantineProvider`; in this project that is centralized in `CustomMantineProvider`. Use [theme object](https://mantine.dev/theming/theme-object/) and [MantineProvider](https://mantine.dev/theming/mantine-provider/) docs when changing theme or color scheme.
- **Styling**: Mantine supports Styles API, CSS modules, and PostCSS (e.g. `postcss-preset-mantine`). See [Styles API](https://mantine.dev/styles/styles-api/), [CSS modules](https://mantine.dev/styles/css-modules/).

## When to use this skill

- Adding or editing a React component that uses any `@mantine/*` import.
- Fixing hydration or “context not found” issues around Mantine in Astro.
- Theming or styling Mantine components in this repo (follow project pattern: adapt layer in `CustomMantineProvider`).

## Quick checklist for new Mantine components

1. Import `CustomMantineProvider` from `@/src/stores/CustomMantineProvider`.
2. Wrap the JSX that uses Mantine in `<CustomMantineProvider>...</CustomMantineProvider>`.
3. Use `@/src/stores/CustomMantineProvider` (or correct relative path); do not introduce a new global MantineProvider unless the project explicitly adds one.
