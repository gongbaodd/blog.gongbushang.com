---
name: webgl-components
description: Wraps WebGL and canvas-heavy React islands with error boundaries and applies Vite/Rapier WASM config for this Astro blog. Use when adding or editing components that use react-three-fiber, @react-three/rapier, maplibre-gl, mapbox-gl, Three.js, or other WebGL/canvas runtimes in client:load islands.
---

# WebGL Components in This Project

WebGL runtimes fail on unsupported hardware, during WASM init, or when Vite pre-bundling breaks physics modules. Isolate failures so the rest of the page keeps working.

## When to apply

- Adding or editing a React island that renders WebGL/canvas (`Canvas`, `Map`, physics sims, etc.)
- Debugging `raweventqueue_new`, `Context Lost`, or `504 Outdated Optimize Dep` in dev
- Upgrading `@react-three/*`, `@dimforge/rapier3d-compat`, or map libraries

## Existing examples

| Component | Path | Runtime |
|-----------|------|---------|
| Hero lanyard | `packages/hero/MantineHero.tsx` | `@react-three/fiber` + `@react-three/rapier` |
| World map | `packages/map/GLMap.tsx` | `react-map-gl` + `maplibre-gl` |
| Lanyard scene | `src/bits/Components/Lanyard/Lanyard.tsx` | Three.js canvas (used by hero) |

## Error boundary pattern

Wrap **only the WebGL subtree**, not the whole island. Keep a static fallback visible outside the boundary.

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface IErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  label?: string
}

interface IErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<IErrorBoundaryProps, IErrorBoundaryState> {
  state: IErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): IErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(this.props.label ?? "WebGL component failed:", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}
```

**Rules:**

1. Place static fallback **outside** the boundary (e.g. profile SVG in `MantineHero.tsx`).
2. Default `fallback` to `null` when the outer UI already degrades gracefully.
3. Use a short `label` in `componentDidCatch` to identify which island failed.
4. Do not wrap unrelated Mantine layout or text content inside the boundary.
5. Astro islands still need `client:load` (or `client:visible`) on the parent `.astro` wrapper.

Reference implementation: `packages/hero/MantineHero.tsx`.

## Vite config (Rapier / WASM)

Project config lives in `astro.config.mjs`. Required once for `@react-three/rapier`:

```js
vite: {
  optimizeDeps: {
    exclude: [
      "@dimforge/rapier3d-compat",
      "@react-three/rapier",
    ],
  },
  build: {
    rollupOptions: {
      treeshake: false, // prevents Rapier WASM init code from being stripped
    },
  },
},
```

When adding **new** WASM packages, append them to `optimizeDeps.exclude` rather than duplicating config.

## Dependency alignment

`@react-three/rapier` pins a specific `@dimforge/rapier3d-compat` version. Mismatch causes `raweventqueue_new` / `rawintegrationparameters_new` at runtime.

1. Check the version in `node_modules/@react-three/rapier/package.json`.
2. Pin it in root `package.json`:

```json
"pnpm": {
  "overrides": {
    "@dimforge/rapier3d-compat": "0.19.2"
  }
}
```

3. Run `pnpm install --no-frozen-lockfile` and verify a single version:

```bash
pnpm why @dimforge/rapier3d-compat
```

Keep `@react-three/rapier` aligned with its expected compat version when upgrading.

## Dev troubleshooting

| Symptom | Fix |
|---------|-----|
| `504 Outdated Optimize Dep` | `rm -rf node_modules/.vite && pnpm dev --force` |
| Rapier WASM undefined in dev | Confirm `optimizeDeps.exclude` and restart with `--force` |
| Rapier works in dev, fails in build | Confirm `build.rollupOptions.treeshake: false` |
| Error boundary logs but page survives | Expected — boundary is the safety net; fix root cause above |

## Checklist for new WebGL islands

```
- [ ] Static fallback exists outside the WebGL subtree
- [ ] ErrorBoundary wraps only the canvas/WebGL component
- [ ] Island uses client:load or client:visible in .astro parent
- [ ] Mantine usage wrapped in CustomMantineProvider (see mantine-ui skill)
- [ ] WASM deps excluded in astro.config.mjs (if applicable)
- [ ] pnpm override matches @react-three/rapier compat version (if using Rapier)
- [ ] Dev verified after cache clear: rm -rf node_modules/.vite && pnpm dev --force
```

## Map components (maplibre / mapbox)

No Rapier-specific Vite config. Still wrap `<Map>` in an error boundary so marker UI and surrounding card layout survive WebGL failures. See `packages/map/GLMap.tsx` — add boundary there if missing.
