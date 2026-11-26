# QA-2 (GON-179) read-only check of https://next.growgen.xyz

Scope: the live pre-cutover site, served by the `growgen-web-testing` Worker. That Worker deploys an older build than `feat/emdash`, so these results describe the old build, not the EmDash branch.

Method: GET and HEAD only, 44 requests in total, one at a time with a 1 s pause. No logins, POSTs, admin, deploys, wrangler or DB access. No repo files changed except this report. Raw outputs are in `/private/tmp/claude-501/-Volumes-MacData-github-blog-gongbushang-com/0ef04fa9-7cf7-45ae-8781-f6ec3d2d561b/scratchpad/` (`headers.txt`, `parity-results.txt`, `bodies/`).

Note on the DoD: `docs/plan/emdash-migration-plan.md` lists QA-2 (`GON-179`) only in the story index (line 23). It has no separate DoD text in the repo, so the checks below follow the brief.

## Summary

| Area | Result |
|---|---|
| 1. Headers and robots | PASS, with one minor finding (404 page has two robots meta tags) |
| 2. URL parity sample (30 URLs) | PASS: 30/30 are 200, no redirects |
| 3. e2e against live URL | NOT RUN (see reason) |
| 4. Response times (5 pages) | Measured: TTFB 0.27 to 0.50 s. Worker CPU not measurable from outside |

## 1. Headers

| Check | Command | Result (pass/fail plus key numbers) | First error lines |
|---|---|---|---|
| `/` | `curl -sI https://next.growgen.xyz/` | PASS: HTTP/2 200, `x-robots-tag: noindex, nofollow`, `cache-control: public, max-age=0, must-revalidate`, `cf-cache-status: HIT`, `server: cloudflare` | none |
| Post page `/life/2015/03/28/bohai-rim/` | `curl -sI` | PASS: 200, `x-robots-tag: noindex, nofollow`, `cf-cache-status: MISS` | none |
| `/robots.txt` headers | `curl -sI` | PASS: 200, `x-robots-tag: noindex, nofollow`, `content-type: text/plain` | none |
| `/robots.txt` body | `curl -s` | PASS: body is `User-agent: *` then `Disallow: /` | none |
| `/sitemap-index.xml` | `curl -sI` | PASS: 200, `content-type: application/xml`, `x-robots-tag: noindex, nofollow` | none |
| 404 path `/this-path-does-not-exist-qa2/` | `curl -sI` and `curl -s` | PASS: status 404, `x-robots-tag: noindex, nofollow`, body 120,689 B | none |
| 404 page robots meta | `grep -o '<meta name="robots"'` on saved body | MINOR FINDING: two tags on the 404 page, `content="noindex,follow"` and `content="noindex, nofollow"`. The page-level tag is not a failure, but it is duplicated | none |
| API `/api/all/0.ndjson` | `curl -sI` | PASS: 200, `x-robots-tag: noindex, nofollow`, `cf-cache-status: HIT`. No `content-type` header in the HEAD response (observation) | none |
| `workers.dev` leaks | `grep -i workers\.dev` on the headers and on the 6 saved bodies | PASS: 0 matches | none |
| Cache headers | from the above | Observation: every HTML and text response sends `max-age=0, must-revalidate`. Edge caching comes from `cf-cache-status: HIT`. Not a failure | none |

Note: my first API probe used `/api/cards/bohai-rim.json`, which returned 404. That slug is made up and is not a valid card path, so it proves nothing. I did not retry it. The valid path is `/api/all/0.ndjson`, as above.

## 2. URL parity sample (30 of 4,945 legacy URLs)

Source: `apps/web/tests/legacy-urls.txt` (4,945 entries, generated from the legacy dist). I compared each sample against the local legacy `dist/` build, which is present in the repo. The sample covers `/`, life, tech, plan, fe, book, movie, tv, sport, music, world (index and two cities), podcast (index and two episodes), tag (two), series (two), year (index and 2016), cv, hero-gallery and a resume page.

| Check | Command | Result | First error lines |
|---|---|---|---|
| 30 sampled URLs return 200 | `curl -s -o /dev/null -w "%{http_code} redirect=%{redirect_url}"` per URL, no redirect follow | PASS: 30/30 are `200`, `redirect=` empty on all | none |
| Legacy dist has each file | `[ -f dist$p ]` or `dist$p index.html` | PASS: 30/30 found as `index.html` | none |

Gallery: `legacy-urls.txt` has no `/gallery` route (0 matches). I sampled `/hero-gallery/` instead, which is in the legacy list. Result: 200.

Per-URL results are in `parity-results.txt` in the scratchpad.

## 3. e2e against the live URL

| Check | Command | Result | First error lines |
|---|---|---|---|
| Playwright/Cucumber e2e against live | not run | NOT RUN | none |

Reason: the suite supports a base URL. `e2e/support/world.ts` reads `E2E_BASE_URL`, and `E2E_CHROME_CHANNEL=chrome` is supported in `e2e/support/hooks.ts`. A browser run loads each page with all its assets, which would be hundreds of requests and goes over the 60-request cap in the brief. The suite's own scripts (`apps/web/scripts/e2e.mjs`, `pnpm test:e2e`) also build `dist-e2e` and serve it locally. Its Cucumber config writes reports into `e2e-results/` in the repo, so I skipped the dry run too.

The only read-only candidate is the `@smoke` set (3 scenarios in `e2e/features/smoke.feature`). Running it needs an explicit go-ahead to exceed the request cap.

## 4. Response times

Measured with `curl -w %{time_starttransfer}` from the macOS host (client-side, includes DNS, TLS and server time):

| Page | Status | TTFB | Total | Body size |
|---|---|---|---|---|
| `/` | 200 | 0.30 s | 0.33 s | 336,600 B |
| `/life/2015/03/28/bohai-rim/` | 200 | 0.30 s | 0.32 s | 151,326 B |
| `/world/` | 200 | 0.27 s | 0.30 s | 131,166 B |
| `/podcast/` | 200 | 0.30 s | 0.31 s | 195,919 B |
| `/year/2016/` | 200 | 0.50 s | 0.54 s | 179,117 B |

Worker CPU time cannot be measured from outside. The 10 ms Free limit needs `wrangler tail` on the deployed Worker, which is out of scope for this read-only check.

## Open items

- Minor: the 404 page carries two robots meta tags (`noindex,follow` and `noindex, nofollow`). Owner: whichever builder owns the 404 template. Reported to Lead for routing.
- Not done: e2e against the live URL (request cap). Needs owner or Lead approval to run `@smoke`.
- Not done: Worker CPU (needs `wrangler tail`, not allowed here).
