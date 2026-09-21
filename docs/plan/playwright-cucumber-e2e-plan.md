# Playwright + Cucumber E2E Test Plan

> Created: 2026-09-21  
> Status: **IMPLEMENTED** (all steps done; see Implementation notes at the bottom)  
> Scope: browser tests for the Astro 7 static site in this repository.

## Goal and current state

Add a small, reliable browser suite that checks the site's important visitor journeys against the same static output served in production. Cucumber owns the Gherkin scenarios and test run; Playwright drives the browser. Keep the existing Vitest unit and component tests under `pnpm test` as a separate, fast suite.

The root package currently has `pnpm build` (`astro check && astro build &&` resume PDF generation), `pnpm preview`, and Vitest scripts, but no browser tests. Astro uses `output: "static"`. Routes worth covering include `/`, `/all`, `/lab`, `/world`, `/year`, `/cv`, `/about`, dynamic post pages, and `/404`. The header has desktop and mobile navigation; search is an idle hydrated island with a Spotlight dialog. Content and the PlantUML grammar are Git submodules, so CI must check them out before building.

## Decisions

- Run tests against `dist/` with `astro preview`, on `127.0.0.1:4321`. Build once before the suite. Use one fixed base URL (also exposed as `E2E_BASE_URL`) and fail if the port is already occupied by an unrelated server.
- Use `@cucumber/cucumber` as the sole runner, `playwright` as the browser library, and `tsx` to load TypeScript step/support files in this ESM package. Do not add a second set of Playwright Test specs or rely on `playwright.config.ts` `webServer`: that lifecycle runs only with the Playwright Test runner. [Cucumber ESM/TypeScript loading](https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md), [Playwright web server](https://playwright.dev/docs/test-webserver).
- Add `start-server-and-test` to start preview, wait for the URL, run Cucumber, and stop preview even after failures. Keep `test:e2e` as the whole build/start/run command; add `test:e2e:run` for rerunning features against an already running preview server. [Server command and readiness syntax](https://github.com/bahmutov/start-server-and-test).
- Start with Chromium only. Add Firefox/WebKit after the smoke suite is stable and a cross-browser need is demonstrated. Install the matching Playwright browser binary with `pnpm exec playwright install chromium` locally and `pnpm exec playwright install --with-deps chromium` in CI. [Playwright CI guide](https://playwright.dev/docs/ci).
- Create a new browser context per scenario and close it in an `After` hook. A browser may be shared within one Cucumber worker; no cookies, local storage, or page objects may leak between scenarios. Start serially (`parallel: 0`); enable parallel workers only after isolation is verified. [Cucumber World](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/world.md), [Playwright contexts](https://playwright.dev/docs/api/class-browser).

## Proposed files and commands

| File                             | Purpose                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `e2e/features/*.feature`         | Visitor-readable scenarios, tagged `@smoke` or `@extended`.                                |
| `e2e/steps/*.ts`                 | Browser actions and assertions using role/text locators and Playwright's built-in waiting. |
| `e2e/support/world.ts`           | Typed per-scenario Cucumber World holding the browser context, page, and base URL.         |
| `e2e/support/hooks.ts`           | Browser/context lifecycle, failure screenshot, optional trace, cleanup.                    |
| `e2e/tsx-register.mjs`           | ESM `tsx/esm/api` registration imported before TypeScript support files.                   |
| `e2e/check-port.mjs`             | Fail before preview starts if `127.0.0.1:4321` is already occupied.                        |
| `cucumber.mjs`                   | Feature glob, ordered support imports, default tags, timeouts, formatters.                 |
| `package.json`, `pnpm-lock.yaml` | Dev dependencies and scripts.                                                              |
| `.gitignore`                     | Ignore `e2e-results/` and generated Cucumber reports/traces.                               |
| `.github/workflows/e2e.yml`      | Build and run the smoke suite on pull requests.                                            |

Proposed root scripts (confirm exact quoting on the supported shell during implementation):

```json
{
  "test:e2e:run": "cucumber-js --config cucumber.mjs",
  "test:e2e": "pnpm build && node e2e/check-port.mjs && start-server-and-test \"pnpm preview --host 127.0.0.1 --port 4321\" http://127.0.0.1:4321 \"pnpm test:e2e:run\""
}
```

`cucumber.mjs` should set `paths: ['e2e/features/**/*.feature']`, import `./e2e/tsx-register.mjs` first, then `e2e/support/**/*.ts` and `e2e/steps/**/*.ts`, and emit a terminal progress formatter plus HTML and JUnit reports into `e2e-results/`. A separate `@smoke` tag expression can limit CI while `pnpm test:e2e` runs the full suite. Cucumber's [configuration](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md) and [formatters](https://github.com/cucumber/cucumber-js/blob/main/docs/formatters.md) document these options. Feature files and support files stay outside `vitest.config.ts`'s `*.test.ts[x]` globs.

## Implementation sequence

### 1. Establish the runnable harness

- [x] Add `@cucumber/cucumber`, `playwright`, `tsx`, and `start-server-and-test` as root dev dependencies with pnpm; commit the lockfile change.
- [x] Add the scripts, port preflight, and Cucumber ESM configuration. Keep step imports relative to `e2e/` so the Cucumber/Node loader does not depend on Astro's `@/` alias. The preflight must fail clearly before `start-server-and-test` can mistake an existing server for this build.
- [x] Implement the World and hooks. Set `baseURL` on each Playwright context; open a fresh page in `Before`. On failure, attach a PNG screenshot to the Cucumber report, optionally save a context trace to `e2e-results/`, then close the context. Close the shared browser after the run. Playwright library traces capture browser activity but not Cucumber assertions, so keep the Cucumber error/report as the assertion record. [Cucumber attachments](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/attachments.md), [Playwright tracing](https://playwright.dev/docs/api/class-tracing).
- [x] Add one `@smoke` feature: load `/`, check the site title and a visible navigation link, click Blog, and assert `/all` plus a rendered post link. Use accessible locators and URL assertions; avoid fixed sleeps, pixel checks, generated CSS classes, and dependence on remote images/analytics.

**Gate:** `pnpm test:e2e` succeeds from a clean checkout after browser installation. Stop/cleanup works when a scenario deliberately fails, and the failure report contains a screenshot. Existing `pnpm test` collection remains unaffected.

### 2. Cover core visitor journeys

Add a few focused scenarios, each with its own context:

| Priority | Feature            | Observable result                                                                                                                                                                           |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Desktop navigation | Home → Blog `/all` → a committed post; post heading/content renders and back/navigation works.                                                                                              |
| P0       | Search             | Open the header Search control, enter a term from a known committed post, open the result, and verify the destination post. Wait for index loading and result visibility, not elapsed time. |
| P0       | Mobile navigation  | At a phone viewport, open the menu/drawer and navigate to World or Archive.                                                                                                                 |
| P1       | Static routes      | `/lab`, `/world`, `/year`, `/cv`, `/about` each render a meaningful heading/content region and do not show the 404 page.                                                                    |
| P1       | Content rendering  | A committed sample post demonstrates code highlighting and one rich content type (KaTeX, Mermaid, or PlantUML) in the browser.                                                              |
| P1       | Not found          | An unknown URL serves the intended 404 experience; assert the visible page, and assert HTTP 404 only if Astro preview actually returns it.                                                  |

Choose one stable post fixture from the pinned `src/content` submodule and document its route and search term in the feature or a small fixture module. Use request interception only for optional external services (view counter, analytics, Cloudinary); do not mock the site's own content or search API. Check both desktop and phone viewport for the scenarios that actually have different UI. Keep Gherkin steps in visitor language and put selectors in TypeScript support code.

**Gate:** Every scenario passes twice in a row locally; feature steps identify the failed visitor action, and one intentionally broken assertion produces a useful screenshot/report.

### 3. Add CI and maintenance checks

- [x] Add a read-only PR workflow: checkout with submodules, set up pnpm and a supported Node version, run `pnpm install --frozen-lockfile`, install Chromium with OS dependencies, then run `pnpm test:e2e` (or the tagged smoke profile if the extended suite grows). Upload `e2e-results/` on failure.
- [x] Reconcile the current `.nvmrc` (`22.12.0`) with dependency engine requirements before choosing CI Node: the existing Astro 7 upgrade plan records newer `jsdom` requiring at least Node `22.22.2` or `24.15.0`. Use one version that passes install and build locally and in CI. (`.nvmrc` and CI both use `24.15.0`.)
- [x] Give CI a build timeout that accommodates this site's large static build and PDF generation; preserve build failure output separately from browser failure output. Do not hide existing unit suite failures by making E2E depend on the current `pnpm test` gate. (`timeout-minutes: 45` on the e2e job.)
- [x] Document local commands in `README.md`: browser install, full E2E run, focused Cucumber tag/name run against preview, and where to open a failed report/trace.

**Gate:** A PR run builds from checked-out submodules, executes the smoke feature, and uploads a readable failure artifact when a scenario fails. The workflow exits nonzero for build, startup, undefined-step, or assertion failures.

## Completion criteria

- A new developer can run the E2E suite with documented pnpm commands after installing Chromium.
- Cucumber owns feature discovery/reporting; Playwright owns browser actions and isolation; Vitest remains the unit/component test runner.
- P0 journeys pass locally and in PR CI on the production build preview.
- Failures leave enough evidence to reproduce them without retaining browser state or generated artifacts in Git.

## Implementation notes (2026-09-21)

Deviations and findings from implementing this plan:

- **Cucumber v13 configuration**: the `timeout` option no longer exists in the
  config file (the docs table omits it); the step timeout is set via
  `setDefaultTimeout(90_000)` in `e2e/support/world.ts`. An ESM config file
  exports the default profile directly (a `{ default: {...} }` wrapper or
  `--profile` does not work as with CJS/JSON), so the smoke profile is a CLI
  tag filter: `pnpm test:e2e:smoke` → `--tags "@smoke"`.
- **Search journey starts on `/all`**: the identical header search is broken
  on the home page — clicking the trigger runs the index load (button flips
  to "Loading…") but `spotlight.open()` never opens the dialog there, while
  `/all`, `/year` and `/about` work. The home-page failure is an application
  bug this suite uncovered (likely related to the React #418 hydration-error
  storm on that page); it deserves its own fix, after which the scenario can
  move back to the home page.
- **Mermaid is not covered**: in the current production build the
  astro-mermaid client script is missing from the page bundle
  (`hasMermaidDiagrams` never ships), so `pre.mermaid` blocks never render.
  KaTeX (server-rendered by rehype-katex) is covered instead, alongside
  shiki code highlighting on `/fe/2025/09/09/tetris-ai`.
- **Clicks are dispatched in-page**: headless Chromium produces only ~2 rAF
  frames/second on this site's animation-heavy pages (particle hero, heat
  map, letter-glitch, WebGL world map), which starves Playwright's
  rAF-based click actionability. Steps wait for an element to "settle"
  (same DOM node seen twice via `setInterval` polling), dispatch a real DOM
  click in the page, and judge success by URL change / dialog presence —
  never by the click result alone. All waiting remains Playwright-driven;
  there are no fixed sleeps.
- **404 status is asserted**: `astro preview` does return HTTP 404 for
  unknown URLs, so the not-found scenario asserts both the rendered page and
  the status code.
- **Fixtures**: `e2e/support/fixtures.ts` pins the committed posts used by
  scenarios (search fixture `/fe/2025/09/08/mermaid`, code fixture
  `/fe/2025/09/09/tetris-ai`, math fixture `/book/2021/02/10/matrix`).
- **Type checking**: `e2e/` is excluded from `tsconfig.json` so `astro check`
  (part of `pnpm build`) is neither slowed down nor coupled to test code;
  oxlint/oxfmt still cover the e2e files.
