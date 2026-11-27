---
name: webgl-components
description: Wraps WebGL and canvas-heavy React islands in apps/web with ReactErrorBoundary and keeps the Vite config they rely on. Use when adding or editing components that use Three.js, GLSL shaders, maplibre-gl / react-map-gl, or other WebGL/canvas runtimes in client islands.
---

# WebGL components in apps/web

WebGL runtimes fail on unsupported hardware, on context loss, or when Vite pre-bundling breaks a module. Isolate failures so the rest of the page keeps working.

## When to apply

- Adding or editing a React island that renders WebGL/canvas (Three.js scene, map, canvas animation)
- Debugging `Context Lost`, a blank canvas, or `504 Outdated Optimize Dep` in dev
- Upgrading `three`, `maplibre-gl`, `react-map-gl` or `vite-plugin-glsl`

## Existing examples

| Component | Path | Runtime |
|-----------|------|---------|
| Home hero | `apps/web/src/particle-hero/ParticleHero.tsx` | Three.js + GLSL shaders (`vite-plugin-glsl`) |
| World map | `apps/web/src/map/GLMap.tsx` (via `src/components/WorldMap.astro`, `client:idle`) | `react-map-gl` + `maplibre-gl` |
| Letter glitch background | `apps/web/src/bits/Backgrounds/LetterGlitch/LetterGlitch.tsx` | 2D canvas |

## Error boundary

Use the shared `ReactErrorBoundary` (`apps/web/src/components/ReactErrorBoundary.tsx`); don't write a new one.

```tsx
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";

<ReactErrorBoundary label="GLMap failed to render" fallback={null}>
  <Map ... />
</ReactErrorBoundary>
```

**Rules:**

1. Wrap **only the WebGL subtree**, not the whole island. Keep a static fallback visible outside the boundary (ParticleHero shows the gallery placeholder while loading or after WebGL fails).
2. `fallback` defaults to `null`; use that when the outer UI already degrades gracefully.
3. Give each boundary a short `label`; it is logged in `componentDidCatch`.
4. Do not wrap unrelated Mantine layout or text inside the boundary.
5. The `.astro` parent still needs a client directive (`client:load`, `client:visible`, `client:idle`).
6. No analytics calls inside render loops (`requestAnimationFrame`, map render events); track discrete actions only.

## Vite config (`apps/web/astro.config.mjs`)

- `vite.plugins: [glsl()]` — `.vert`/`.frag`/`.glsl` imports for the particle hero.
- `resolve.alias["onnxruntime-node"]` → `src/empty-module.js`, so a transitive import never pulls the native module into a bundle.
- `optimizeDeps.include: ["react-plock"]` and `ssr.noExternal: ["react-plock"]` (CJS-ish ESM).
- `optimizeDeps.exclude` still lists the Rapier packages; nothing in apps/web uses Rapier today. If you add a WASM package, append it there.
- `build.rollupOptions.treeshake: { moduleSideEffects: "no-external" }` keeps side effects of external modules (WASM init) while allowing unused-export elimination. Don't switch back to `treeshake: false`; it shipped whole icon libraries.

Everything is prerendered and the WebGL code runs client-side only, so these islands add almost nothing to the Worker bundle (PORT-4: +4 KiB).

## Dev troubleshooting

| Symptom | Fix |
|---------|-----|
| `504 Outdated Optimize Dep` | `rm -rf apps/web/node_modules/.vite && pnpm --filter web dev --force` |
| Canvas blank only in build | Check the module isn't tree-shaken; compare against `treeshake` above |
| Error boundary logs but page survives | Expected — the boundary is the safety net; fix the root cause |

## Checklist for new WebGL islands

```
- [ ] Static fallback exists outside the WebGL subtree
- [ ] ReactErrorBoundary wraps only the canvas/WebGL component, with a label
- [ ] Island uses a client directive in the .astro parent
- [ ] Mantine usage wrapped in CustomMantineProvider (see mantine-ui skill)
- [ ] New WASM deps excluded in optimizeDeps (if any)
- [ ] pnpm --filter web check:hydration passes on the page
```
