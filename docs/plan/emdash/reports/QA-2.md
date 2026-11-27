# QA-2 pre-soak results (GON-179)

Date: 2026-11-27. Tester run, unattended. Base: `origin/master` at `3517e2e9`.
Scope: `next.growgen.xyz` (production Worker `growgen-web`, GET/HEAD only) and `local` (Supabase on `127.0.0.1:54322`).

Rules followed: no writes to the production DB or admin, no deploys, no reads of plaintext `.env`, no secrets printed, `pnpm-lock.yaml` not touched. `wrangler` used only for `whoami`, `tail` (read-only) and `deploy --dry-run`. The report is the only file changed.

## Results

| # | Check | Command | Result (pass/fail plus key numbers) | First error lines |
|---|---|---|---|---|
| 1 | Web build (local) | `DERIVE_READONLY=1 DERIVE_DATABASE_URL=<local 54322> pnpm --filter web build` | PASS, exit 0. 996 posts read from local DB, 76 gallery images, 75 traces cached, 1 placeholder, 18 CV PDFs written | none |
| 2 | Web unit tests | `pnpm --filter web test` | PASS, 44 files, 511 tests | none |
| 3 | URL parity (local build) | `pnpm --filter web parity` | PASS, exit 0. Missing paths: 0. 25 extra `/api/cards/...` paths reported, not gated (default run) | none |
| 4 | e2e (local) | `DERIVE_READONLY=1 ... pnpm --filter web test:e2e` | PASS, 14 scenarios, 90 steps, exit 0 | none |
| 5 | e2e (production) | `E2E_BASE_URL=https://next.growgen.xyz pnpm exec cucumber-js --config cucumber.mjs --tags 'not @analytics-on'` (repo root) | PASS, 14 scenarios, 90 steps, exit 0. The host is not recorded in the report, so the target rests on the `E2E_BASE_URL` path in `apps/web/e2e/support/world.ts` | none |
| 6 | URL parity (production, HTTP) | GET of 4,945 paths from `apps/web/tests/legacy-urls.txt`, 3 in parallel. `pnpm --filter web parity` is file-based and has no URL mode, so this is an adapted check | FAIL on 2 paths. 4,942 return 200, 1 redirects (`/404.html` to `/404`, 307), 2 return 404 (`/tag/c%23/`, `/api/tag/c%23/0.ndjson`). Note `/tag/c%2523/` returns 200, so the built file is `c%23` but the Worker decodes the request to `c#` | `404  /tag/c%23/` and `404  /api/tag/c%23/0.ndjson` |
| 7 | Lockdown: admin path | `curl -s -o /dev/null -w "%{http_code}" https://next.growgen.xyz/_emdash/admin` | PASS, 404 (9 B, `text/plain`). `/_emdash/api/setup` also 404 | none |
| 8 | Lockdown: robots | `curl -s https://next.growgen.xyz/robots.txt` | PASS, 200, `x-robots-tag: noindex, nofollow`, body `User-agent: *` then `Disallow: /` | none |
| 9 | No Mixpanel or AdSense in HTML | `curl` home (343,837 B), then search for `mixpanel`, ad-script hosts | PASS on the literal check. 0 Mixpanel, 0 ad-script hosts. The 17 `adsense` hits are serialized content flags (`"adsense":[0,false]`), not an ad script | none |
| 10 | Lockdown: analytics before live (skill rule) | Same HTML | FAIL against the skill rule "runs no analytics or ads" until `PUBLIC_SITE_LIVE=true`. The page loads GoatCounter on every page: `<script data-goatcounter="https://gongbaodd.goatcounter.com/count" ... src="//gc.zgo.at/count.js">`. Source: `apps/web/src/footer/Footer.astro:231` and `packages/footer/Footer.astro:230` | `<script data-goatcounter="https://gongbaodd.goatcounter.com/count" async fetchpriority="low" src="//gc.zgo.at/count.js">` |
| 11 | Worker CPU (production) | `pnpm exec wrangler tail growgen-web --format json`, with a 13-URL browse and a 5-URL second sample. Wrangler auth already present (OAuth, `whoami` ok). No login | PASS on the sample. 5 Worker invocations seen, all `outcome: ok`, `cpuTime: 0` ms (ms granularity), `wallTime` 0-7 ms. The 404 misses and `/_emdash/*` reached the Worker. The other 10 browse requests (home, post, world, podcast, umap, api/all, year, tag, cv, robots, sitemap, card API) reached no Worker invocation. Sample only, not a load test | none |
| 12 | Worker size (uncompressed) | `pnpm exec wrangler deploy --dry-run --outdir <scratch> -c dist/server/wrangler.json` in `apps/web`, on the local build | PASS, exit 0. Bundle 579 modules, total 11,291.18 KiB (about 11.0 MiB) against the 64 MiB limit. Upload total 11,380.52 KiB, gzip 2,553.19 KiB. Measured on the local build, not the deployed bundle | none |
| 13 | Asset files | `find apps/web/dist/client -type f \| wc -l` | PASS, 5,293 files (limit 20,000). Wrangler reports 11,180 entries, which is the 5,293 files plus 5,888 directories | none |
| 14 | `emdash migrate --from-config --check` (local) | `pnpm exec emdash migrate --from-config --check --database-url-env=DERIVE_DATABASE_URL` with that var set to local 54322 | PASS, exit 0. Target `postgres 127.0.0.1:54322/postgres`. Pending: none. Unknown applied: none | none |
| 15 | `emdash migrate --check` (production) | not run | NOT RUN. It would need production DB credentials, and reading them means reading the plaintext `.env`, which is not allowed | none |
| 16 | `emdash doctor` | not run | SKIP. SQLite-only per brief | none |
| 17 | 404, production | `curl -s -w "%{http_code}"` on a random path | PENDING #211 deploy. Production still serves master's placeholder: `<h1>Page not found</h1><p>The page you're looking for doesn't exist.</p><a href="/">Go home</a>`, status 404, `<meta name="robots" content="noindex, nofollow">` | none |
| 18 | 404, PR #211 built vs legacy | `pnpm --filter web build` on detached `origin/emdash/GON-227-404-page` (2ae3e0f5), local DB, read-only derive. Compared with legacy `dist/404.html` from repo root and legacy `src/pages/404.astro` plus `src/components/NotFoundPage.tsx` | PASS on content. Built page has `404`, `Page Not Found`, the same paragraph, `Go Home` and `Go Back`, matching the legacy component. Differences: icons are inline SVG copies instead of `@tabler/icons-react`, and the built page has `<meta name="robots" content="noindex,follow">` (legacy had none). Build exit 0 | none |
| 19 | Publish, then rebuild | not run | SKIP. Needs the owner in the admin (GON-235). Pending owner | none |
| 20 | Cloudinary usage (`cld admin usage`) | not run | NOT DUE. Sprint-end only | none |

## Minor observations (not failing)

- `https://next.growgen.xyz/404` returns 200 (soft 404) on production, while `/404.html` returns 307 to `/404`. Both pages are noindex.
- The 404 served at an unknown path returns 404 with the master placeholder. The PR build has a single robots meta, `noindex,follow`, which differs from the response header `x-robots-tag: noindex, nofollow`.
- The Chinese tag paths (`/tag/宇宙编辑部/`) return 307 when the request is sent raw, and 200 when percent-encoded. Browsers encode, so this is not a parity failure.
- Worker CPU was measured on a small sample (5 invocations, ms granularity). It is not a load test.

## Failing checks and tickets

Linear tools were not available in this session, so no tickets were created and the GON-179 comment was not posted. Drafts for the owner or Lead to file (label `claude-opus-5.5`, type `Bug`, project Blog, blocking GON-182):

1. **Parity: `/tag/c%23/` and `/api/tag/c%23/0.ndjson` return 404 on next.growgen.xyz.** Both are in `legacy-urls.txt`. The built directory is literally `c%23`, which the Worker cannot match because the request path is decoded to `c#`. The parity check is file-based, so it does not catch this. Repo mention: `apps/web/tests/built-paths.ts:38` documents the compare-as-written rule but not the Worker behaviour. Not covered by any ticket found in the repo.
2. **GoatCounter analytics script on the pre-live production site.** `gc.zgo.at/count.js` loads on every page from `apps/web/src/footer/Footer.astro:231` (and `packages/footer/Footer.astro:230`). The skill rule says the non-live site runs no analytics until `PUBLIC_SITE_LIVE=true`. Owner decision needed on whether GoatCounter is intended.

## Pending on the owner

- Merge PR #211 (`https://github.com/gongbaodd/blog.gongbushang.com/pull/211`) and deploy. Then re-run the production 404 check and the 404 comparison above.
- Publish, then rebuild (GON-235, admin).
- `cld admin usage` at sprint end.
- Decide on GoatCounter (failing item 2).
- Fix or accept `/tag/c%23/` (failing item 1).
- Production `emdash migrate --check`, if the owner wants it run with the production credentials.
