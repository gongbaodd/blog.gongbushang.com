---
name: vitest-testing
description: Use Vitest (vitest.dev) for unit and integration tests. Use when writing or editing tests, configuring the test runner, running tests, mocking, or when the user asks about testing in this project.
---

# Vitest Testing

[Vitest](https://vitest.dev) is a Vite-native test framework: fast, Jest-compatible API, ESM/TypeScript/JSX out of the box. Use the [official docs](https://vitest.dev/guide/) as the authoritative reference.

## Quick reference

- **Docs**: [vitest.dev](https://vitest.dev) · [Guide](https://vitest.dev/guide/) · [API](https://vitest.dev/api/) · [Config](https://vitest.dev/config/)
- **Install**: `npm install -D vitest` (requires Vite >=6, Node >=20)
- **Run**: `npm run test` (watch) or `vitest run` (single run), `vitest run --coverage` for coverage

## Writing tests

- **File names**: Tests must contain `.test.` or `.spec.` in the name (e.g. `sum.test.ts`, `foo.spec.ts`).
- **Imports**: `import { test, describe, expect, vi } from 'vitest'`.
- **Basic test**:
```ts
import { expect, test } from 'vitest'
import { sum } from './sum.js'

test('adds 1 + 2 to equal 3', () => {
  expect(sum(1, 2)).toBe(3)
})
```
- **Suites**: `describe('name', () => { ... })`; use `test` or `it` inside.
- **Async**: Return a Promise or use `async`; Vitest waits for resolution.
- **Options**: `test.skip`, `test.only`, `test.todo`, `test.concurrent`; or pass options object: `test('name', { skip: true }, () => { ... })`. Timeout: `test('name', () => { ... }, 10_000)` or `{ timeout: 10_000 }`.
- **Context**: Use `expect` from the [test context](https://vitest.dev/guide/test-context) in concurrent tests: `test('name', ({ expect }) => { ... })`.

## Assertions

- **Jest-compatible** [expect](https://vitest.dev/api/expect): `expect(x).toBe(y)`, `expect(x).toEqual(y)`, `expect(fn).toHaveBeenCalledWith(...)`, `expect(x).toMatchSnapshot()`, etc.
- **Chai** is also available for assertions.

## Config

- Vitest **reuses Vite config** (resolve, plugins, alias). Add a `test` block to `vite.config.ts` and reference Vitest types:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
export default defineConfig({
  test: {
    // environment: 'node' | 'jsdom' | 'happy-dom'
    // globals: true
    // include / exclude
  },
})
```
- **Standalone config**: Use `vitest.config.ts` with `defineConfig` from `vitest/config` if not using Vite for the app. Optionally `mergeConfig` with Vite config.
- **Key options**: [Config Reference](https://vitest.dev/config/) — `environment`, `include`, `exclude`, `setupFiles`, `testTimeout`, `globals`, etc.

## CLI

- `vitest` — watch mode (default in dev); only reruns affected tests.
- `vitest run` — run once (typical in CI).
- `vitest run --coverage` — run with coverage (requires coverage provider).
- Filter: `vitest run -t "test name"` or by file path. Full list: `npx vitest --help`.

## Mocking

- **vi** from `vitest`: `vi.fn()`, `vi.mock('module', () => ({ ... }))`, `vi.spyOn(obj, 'method')`, `vi.stubEnv()`. [Mocking](https://vitest.dev/guide/mocking).
- Jest-compatible mock APIs on `vi`.

## Environment (DOM)

- For DOM/browser APIs use `environment: 'happy-dom'` or `environment: 'jsdom'` in config. Install `happy-dom` or `jsdom` as dev dependencies.

## Other features

- **Snapshot**: `expect(result).toMatchSnapshot()` — [Snapshot](https://vitest.dev/guide/snapshot).
- **Coverage**: v8 or istanbul; run with `vitest run --coverage` — [Coverage](https://vitest.dev/guide/coverage).
- **Projects**: Multiple configs in one repo — [Test Projects](https://vitest.dev/guide/projects).
- **In-source tests**: `if (import.meta.vitest) { const { test, expect } = import.meta.vitest; ... }` — [In-source](https://vitest.dev/guide/in-source).

## When to use this skill

- Adding or editing `*.test.*` / `*.spec.*` files.
- Configuring Vitest or Vite for tests.
- Running or debugging tests, coverage, or CI.
- Mocking modules or functions in tests.
