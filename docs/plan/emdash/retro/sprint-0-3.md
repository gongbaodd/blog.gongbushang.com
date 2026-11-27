# Retro: Sprints 0–3 (2026-11-24 → 2026-11-25)

## Goal and outcome
Plan: S0 prove risky decisions, S1 envs + model, S2 media/CI/images, S3 import + shell + post page (planned to end 2027-01-08).
Outcome: all of that, plus most of S4/S5 (PORT-3…PORT-7), landed in two calendar days. **Every legacy URL group builds** (route-parity has no exemptions). Testing is deployed and populated with 995 posts.

## Shipped (commit refs)
| Sprint | Done | Commits |
|---|---|---|
| S0 (25 pts) | S0-1 (4cebc46), S0-2 (8a94415), S0-3 (a0a048d), S0-4 (1696f27), S0-5 (d6178c0), S0-6 (c51752d), S0-7 (832303f), S0-8 (94e6197, 2be6a87), FIX-1 (64e115a, dd8dadb) | |
| S1 | INF-2 (c84cd39), MIG-0 (cdb3241, 4,945 paths), CMS-1 (15037a8), INF-3 (fe67b8b, 25d14ef; testing deployed) | |
| S2 | MIG-2 phase 1 (fa28a34, dry run only), INF-4/INF-6 workflows (a4de777, **draft**) | |
| S3 | MIG-1 (ffa1d36, 1b 0114778, 1c 564869f), PORT-1 (0969d02, 6a3c29b), PORT-2 (50af015) | |
| Pulled ahead | PORT-3 (64af005), PORT-4 (fb92ab6), PORT-5 (e6ba7ff), PORT-6 (00359ac), PORT-7 (90a68b5), INF-7 (72b3eed, unplanned, D12) | |

Carried over: CMS-2 (5), CMS-3 (2), CMS-4 (2), INF-3 production half (Hyperdrive, claim, passkey), INF-4/INF-6 (CI drafted, no tokens), INF-5 (2), INF-8 (1, new), MIG-2 uploads (part of 3), MIG-3 (3), QA-1 CI wiring (route-parity unit test exists), DATA-1 (2), PORT-8 (5), PORT-9 (3).

## Gantt slippage
- Ahead: PORT-1…PORT-7 finished about 6–8 weeks before their dated bars (PORT-3 was 2027-01-04, PORT-7 2027-01-19). Gantt bars for done stories still show the original dates; only the `done` flag was updated.
- Behind / blocked on owner: MIG-2 uploads (bar 12-14), INF-4 (needs tokens), CMS-2 (needs the cloud name), INF-3 production.
- Unplanned: INF-7 (3 pts), INF-8, MIG-1b/1c.
- Lesson: owner-gated work, not coding, is now the critical path.

## Metrics
- Posts 995 (plan said 994); legacy URL groups: 0 missing (post 995, category 10, tag 433, series 26, year 13, world 156, api 3,080).
- Worker about 20 MB of 64 MiB (19,988 KiB); static assets about 5.3k of 20k; `dist/client` ~162 MB for posts alone.
- Cloudinary 4.43 / 25 credits; MIG-2 upload adds about +0.19.
- Import: 995/995 `body_md` sha256-identical; ~45 s local, ~2.5 h to testing via local admin.
- Tests: 209 legacy unit tests stayed green; apps/web tests passed per story.

## Keep
- Scout notes and "wheel first" rule; the spikes (S0-3…S0-6) removed risk before porting.
- Independent cross-model review (Gemini): caught the stale limit and 15 plan findings.
- Build guards (`check-static-routes`, route-parity, empty-build) turned silent failures into red builds.
- Byte-identical import check (sha256) and `legacy-urls.txt` as the single parity oracle.
- Knowledge entries written per story, with date and ID.

## Problem (root cause)
1. **Admin CPU on Workers Free.** Authenticated admin calls cost 5–15 ms, term lists 1102 each time; the bulk import failed 890/995. Root cause: the 10 ms budget was only tested with an empty DB (23–62 ms cold looked "fine"). Result: D12 local admin and INF-7 lockdown.
2. **2.5 h testing import.** Root cause: a request per post over the pooler to ap-southeast-1 at concurrency 4, then publish per item. No bulk path (CLI is SQLite-only for seed/export).
3. **Agent permission denial on the Cloudinary upload.** The auto-mode classifier blocked `upload.mjs --execute` despite owner approval; approval in chat is not permission for the harness. Result: MIG-2 stopped at a dry run.
4. **`astro dev` daemon and `.dev.vars` override.** Astro 7 dev is a daemon, so `pkill` + restart reused the old process; the adapter copies `.dev.vars` into `process.env` over exported vars. Risk: writing to the wrong DB. Fixed by the INF-7 launcher and nonce probe.
5. **Lockfile pruning in worktrees without the submodule.** `pnpm install` without `shiki-plantuml` dropped ~1,100 lockfile lines; merge conflicts had to be resolved in the main checkout.
6. **Root `@types/node` hoisting break.** After a lockfile re-resolve root `astro check` failed (9 errors), which would have broken Vercel. Fixed by pinning `@types/node@25.9.1` (1faf288).
7. **Stale free-tier assumptions.** The plan said a 3 MB Worker limit (real: 64 MiB), and that static 404s never reach the Worker (real: ~1–2 ms CPU each, counted in 100k/day). Gemini caught the first; the second was found at INF-7. Root cause: limits written from memory, not the live page.
8. Smaller: plan said 994 posts (995); tag label casing (MIG-1c); `process.env` empty in prerender (PORT-7); first-admin wizard unlocked (SETUP_TOKEN gate).

## Try
- Check every free-tier number against the live docs when a story starts; record the date.
- Test CPU with production-sized data, not the seed, before choosing a runtime path.
- Run imports against local first, then move data with `db dump` rather than the API.
- Ask the owner to pre-approve named high-impact commands (uploads) in permissions up front.
- Always use `pnpm admin:*`; never hand-run `astro dev` against a remote DB.
- Do `pnpm install` only in the main checkout (submodule present), then run root `astro check` after any lockfile change.
- Re-baseline the Gantt dates now (bars are stale).

## Action items
| Action | Owner |
|---|---|
| Re-baseline Gantt and sprint table (PORT done, CI/media blocked) | Lead |
| INF-8: `client_payload.environment` + workflow honours it | Builder-Infra |
| CMS-2/CMS-4, DATA-1, PORT-8, PORT-9 | Builder-Core / Tester |
| MIG-3 gallery + podcasts; MIG-2 upload once approved | Migrator |
| INF-6 backup (age) + size guard; INF-5 content sync | Builder-Infra |
| QA-2 check static-miss CPU in `wrangler tail` | Tester |
| Fix plan §10/D8 wording on static misses | Lead |
| Gemini review of D12 and the Worker lockdown | Reviewer-Gemini |

## Open owner items
- Image upload: approve/run MIG-2 `upload.mjs --execute` (934 assets, 190.6 MB).
- Correct `CLOUDINARY_CLOUD_NAME` (testing returns 401; real name is not what `.dev.vars` holds).
- Backup key: age public key for the nightly production `pg_dump`.
- CI tokens/vars: GitHub PAT for dispatch, Cloudflare API token, Supabase pooler secrets, environment variables.
- GoatCounter allowed domains: add `growgen.xyz` before cutover.
- Also pending: production Hyperdrive, first-admin claim and passkey (D11), DNS for the production host.
