# QA-3 Report & Runbook: Lighthouse / Core Web Vitals Parity

Linear ticket: **`QA-3` (`GON-180`)**  
Harness: [`apps/web/scripts/perf/cwv-check.mjs`](../../../../apps/web/scripts/perf/cwv-check.mjs)  
Unit tests: [`apps/web/scripts/perf/cwv-check.test.ts`](../../../../apps/web/scripts/perf/cwv-check.test.ts)

## 1. Purpose & Design

`cwv-check.mjs` is a zero-new-dependency Core Web Vitals (CWV) and Lighthouse parity harness for comparing the legacy Astro blog (`dist/` / `https://growgen.xyz`) against the EmDash Cloudflare Workers candidate (`apps/web/dist/client/`, `growgen-web-testing.<account>.workers.dev`, and `https://next.growgen.xyz`).

Key capabilities:
- **Multi-format report ingestion**: parses Lighthouse v10/v11/v12 LHR JSON (including `{ lhr }` wrappers and `total-byte-weight` / `resource-summary` / `network-requests` fallbacks), single-route Playwright CWV JSON, and multi-route `cwv-report` bundles — from either a single `.json` file or a directory of per-route / multi-run JSON files (automatically aggregating multiple runs per route by **median**).
- **Live collection (`--collect`)**: captures metrics directly from any preview or staging origin using either Lighthouse CLI (`--collector lighthouse`) or Playwright Chromium + `PerformanceObserver` (`--collector playwright`, or `--collector auto`), with configurable `--runs`, `--preset mobile|desktop`, and `--routes`.
- **CI-ready output**: emits a GitHub-flavored Markdown comparison table (appending to `$GITHUB_STEP_SUMMARY` when set) or structured JSON (`--json`), returning exit code `0` on pass, `1` on regression or missing route, and `2` on invalid CLI arguments.

## 2. Representative Route Set

Default routes (`DEFAULT_ROUTES` in `cwv-check.mjs`, overridable with `--routes`):

| Route | Archetype | Why included |
|---|---|---|
| `/` | Home | Heaviest interactive shell (11 Astro islands, hero, cards, search) |
| `/fe/2025/09/08/mermaid/` | Blog post | Code blocks, Mermaid diagrams, post layout, TOC, hydration |
| `/fe/` | Category listing | Paginated/filtered archive listing (179 posts) |
| `/tags/` | Tag directory | High link-density taxonomy page |
| `/podcast/` | Podcast index | Media card listing + podcast layout |
| `/about/` | Static page | Lightweight baseline shell (5 Astro islands) |

All six routes exist in `apps/web/tests/legacy-route-groups.json`, legacy `dist/`, and `apps/web/dist/client/`.

## 3. Regression Budgets

Default thresholds enforced per route (every threshold is overridable via CLI flags):

| Metric | Default Budget | CLI Flag(s) | Rationale |
|---|---|---|---|
| **Performance Score** (0–100) | Drop `<= 5` pts | `--max-score-drop` | Absorbs normal Lighthouse lab variance while catching regressions |
| **LCP** (ms) | Regression `<= +250 ms` **or** `+15%` | `--max-lcp-ms`, `--max-lcp-pct` | Avoids false positives on sub-second local loads while protecting CWV Good (`<= 2.5 s`) |
| **CLS** (unitless) | Candidate `<= 0.10` | `--max-cls` (optional `--max-cls-regression`) | Google CWV "Good" ceiling (`0.10`) |
| **TBT** (ms) | Regression `<= +100 ms` | `--max-tbt-ms` | Lab proxy for main-thread blocking / hydration regressions |
| **INP** (ms) | Regression `<= +100 ms` | `--max-inp-ms` | Checked automatically when both reports include INP |
| **FCP** (ms) | Regression `<= +250 ms` **or** `+15%` | `--max-fcp-ms`, `--max-fcp-pct` | Guards render-blocking CSS/font regressions |
| **Transfer Size** (bytes) | Growth `<= +100 KiB` **or** `+15%` | `--max-transfer-bytes`, `--max-transfer-pct` | Catches accidental bundle/asset bloat |
| **Route Coverage** | Every compared route must exist on both sides | `--allow-missing-routes`, `--require-default-routes` | Prevents dropped routes from silently passing |

## 4. How to Run Parity Benchmarks

### 4.1 Local Preview: Legacy Astro vs `apps/web`

1. Build and serve the legacy Astro site on port `4321` (repo root):
   ```bash
   pnpm build
   pnpm preview --host 127.0.0.1 --port 4321
   ```
2. In a second terminal, build and serve `apps/web` on port `4322`:
   ```bash
   pnpm --filter web build
   pnpm --filter web preview -- --host 127.0.0.1 --port 4322
   ```
3. Collect 3 median runs per route against each server (Lighthouse recommended; Playwright works if Lighthouse isn't installed):
   ```bash
   # Using Lighthouse CLI (or npx lighthouse)
   node apps/web/scripts/perf/cwv-check.mjs \
     --collect --collector lighthouse --preset mobile --runs 3 \
     --url http://127.0.0.1:4321 \
     --out tmp/cwv/legacy

   node apps/web/scripts/perf/cwv-check.mjs \
     --collect --collector lighthouse --preset mobile --runs 3 \
     --url http://127.0.0.1:4322 \
     --out tmp/cwv/candidate

   # Compare against default budgets (Markdown table; exits non-zero on regression)
   node apps/web/scripts/perf/cwv-check.mjs \
     --legacy tmp/cwv/legacy \
     --candidate tmp/cwv/candidate \
     --require-default-routes
   ```
   Or using the already-installed root `playwright` package (captures LCP, CLS, FCP, TBT via Long Tasks, INP, and transfer bytes — `performanceScore` is `n/a`):
   ```bash
   node apps/web/scripts/perf/cwv-check.mjs \
     --collect --collector playwright --runs 3 \
     --url http://127.0.0.1:4321 --out tmp/cwv/legacy-pw.json

   node apps/web/scripts/perf/cwv-check.mjs \
     --collect --collector playwright --runs 3 \
     --url http://127.0.0.1:4322 --out tmp/cwv/candidate-pw.json

   node apps/web/scripts/perf/cwv-check.mjs \
     --legacy tmp/cwv/legacy-pw.json \
     --candidate tmp/cwv/candidate-pw.json
   ```

### 4.2 Against `testing` (`*.workers.dev`)

Compare current production (`https://growgen.xyz`) against the deployed `growgen-web-testing` Cloudflare Worker (`https://growgen-web-testing.<account>.workers.dev`):

```bash
node apps/web/scripts/perf/cwv-check.mjs \
  --collect --collector lighthouse --preset mobile --runs 3 \
  --url https://growgen.xyz \
  --out tmp/cwv/prod-legacy

node apps/web/scripts/perf/cwv-check.mjs \
  --collect --collector lighthouse --preset mobile --runs 3 \
  --url https://growgen-web-testing.<account>.workers.dev \
  --out tmp/cwv/testing-worker

node apps/web/scripts/perf/cwv-check.mjs \
  --legacy tmp/cwv/prod-legacy \
  --candidate tmp/cwv/testing-worker \
  --require-default-routes
```

### 4.3 Against `next.growgen.xyz` (Pre-Cutover Staging)

Before DNS cutover (`SOAK-1` / `CUT-1`), run both mobile and desktop passes against `https://next.growgen.xyz`:

```bash
for preset in mobile desktop; do
  node apps/web/scripts/perf/cwv-check.mjs \
    --collect --collector lighthouse --preset "$preset" --runs 3 \
    --url https://growgen.xyz \
    --out "tmp/cwv/legacy-${preset}"

  node apps/web/scripts/perf/cwv-check.mjs \
    --collect --collector lighthouse --preset "$preset" --runs 3 \
    --url https://next.growgen.xyz \
    --out "tmp/cwv/next-${preset}"

  node apps/web/scripts/perf/cwv-check.mjs \
    --legacy "tmp/cwv/legacy-${preset}" \
    --candidate "tmp/cwv/next-${preset}" \
    --require-default-routes \
    --json > "tmp/cwv/diff-${preset}.json"
done
```

## 5. Offline Static Asset Baseline (Legacy `dist/` vs `apps/web/dist/client/`)

> **Sandbox execution note:** Live preview servers, headless Chromium, and Lighthouse CLI were **not** executed in this sandbox session (network is disabled and `lighthouse` / Chromium binaries are not available inside the sandbox). The table below captures verified **offline static payload measurements** from existing built assets on disk:
> - Legacy build: `dist/` (built 2026-11-24)
> - Candidate build: `apps/web/dist/client/` (built 2026-11-25)
>
> JS bytes include the full **transitive static ES module import graph** under `/_astro/` referenced by each page's HTML (not just top-level entry scripts). External CDN images/fonts (Cloudinary, Google Fonts) are excluded until live Lighthouse runs execute.

| Route | Islands (Legacy → Candidate) | HTML Gzip (Legacy → Candidate) | CSS Gzip (Legacy → Candidate) | Transitive JS Gzip (Legacy → Candidate) | Total Local Gzip (Legacy → Candidate) | Delta |
|---|---:|---:|---:|---:|---:|---:|
| `/` | 11 → 11 | 43.4 KB → 44.0 KB | 70.6 KB → 70.4 KB | 365.7 KB → 352.5 KB | 479.7 KB → 466.8 KB | **-2.7%** |
| `/fe/2025/09/08/mermaid/` | 8 → 10 | 24.7 KB → 24.8 KB | 67.0 KB → 66.9 KB | 225.7 KB → 214.6 KB | 317.4 KB → 306.3 KB | **-3.5%** |
| `/fe/` | 8 → 8 | 24.1 KB → 24.6 KB | 59.2 KB → 59.0 KB | 225.1 KB → 211.7 KB | 308.4 KB → 295.4 KB | **-4.2%** |
| `/tags/` | 5 → 5 | 24.3 KB → 24.8 KB | 39.2 KB → 39.0 KB | 193.6 KB → 180.5 KB | 257.1 KB → 244.3 KB | **-5.0%** |
| `/podcast/` | 8 → 8 | 26.1 KB → 26.7 KB | 59.2 KB → 59.0 KB | 220.1 KB → 206.8 KB | 305.4 KB → 292.5 KB | **-4.2%** |
| `/about/` | 5 → 5 | 20.1 KB → 20.8 KB | 39.2 KB → 39.0 KB | 193.6 KB → 180.5 KB | 252.9 KB → 240.2 KB | **-5.0%** |

### Observations from Offline Static Analysis
1. **Local transfer payload improves across all 6 routes (-2.7% to -5.0% gzip)**, driven by smaller transitive client JS bundles in `apps/web` (Astro 7.4 / Vite chunking).
2. **Watch item for live TBT on blog posts**: `/fe/2025/09/08/mermaid/` has `10` `<astro-island>` elements in `apps/web` vs `8` in legacy `dist/`. Live Lighthouse runs should verify that TBT stays within the `+100 ms` budget on post pages.
3. **HTML sizes are at parity** (+0.1 KB to +0.6 KB gzip across all six routes).

## 6. Merge Integration Note for Coordinator

Add the following 1-line glob to `test.include` in `apps/web/vitest.config.ts` at merge time (left unmodified on this branch per ownership rules):

```ts
"scripts/perf/*.test.ts",
```
