# Final retro: EmDash migration (2026-11-24 → 2026-11-27)

Covers everything after `retro/sprint-0-3.md` and closes the migration (CUT-3, GON-185).

## Goal and outcome

Goal: move growgen.xyz from the legacy `src/` Astro site (Vercel, markdown in a content submodule) to EmDash on Cloudflare Workers Free + Supabase Free, with no URL changes, then delete the legacy code.
Outcome: **done.** `growgen.xyz` serves `growgen-web` since 2026-11-27 (GON-214, 13:36 UTC); `robots.txt` allows crawling. CUT-2a/2b/2c (PRs #226, #230, #231) deleted `src/`, the legacy-only packages, the content submodule and the legacy workflows. The legacy `growgen` and `growgen-web-testing` Workers are deleted and the content repo archived (GON-215).

## Stories done / carried over

- Linear project `Blog`: 108 issues Done, 53 of them estimated (≈164 points). 34 PRs merged into `master` since 2026-11-24 (plus the `feat/emdash` merge, PR #197).
- Since the sprint 0–3 retro: CMS-2/CMS-4, INF-4/5/6/8/9/10, MIG-2…MIG-7, PORT-8/8b/9/10, DATA-1, QA-1…QA-4, the SEC series (SEC-01…SEC-15 from the QA-4 audit), SOAK-1, CUT-1, CUT-2a…2d, CUT-3.
- Carried over (open, not blocking): GON-263 DATA-3 (re-key production embeddings to Workers AI), GON-249 Markdown field widget for `body_md`.
- Cancelled: CMS-3 passkey enrolment (GON-159).

## Plan vs actual

- The original Gantt ran sprint 3 alone to 2027-01-08 (see `sprint-0-3.md`). Real: 4 calendar days from scaffold (S0-2, 2026-11-24) to go-live.
- SOAK-1 was planned as two weeks, cut to three days (11/27–11/29) by the owner on 2026-11-26, and closed on 2026-11-27 13:01 UTC. Go-live was planned for 11/30 and happened on 11/27.
- Environments shrank from `local`/`testing`/`production` to `local`/`production` (INF-10), which removed a whole deploy target and Supabase project.
- Dropped on the way: `apps/colorize` Worker (PORT-8b: 52/100 exact colours, CPU not provably < 10 ms), GoatCounter (GON-239), the local LM Studio embedding provider (GON-255).

## Metrics (latest measured)

- Posts 995 (996 in the local DB at QA-2); legacy URLs: 4,945 checked against production at QA-2, 0 missing in the file-based parity run.
- Worker 11.0 MiB uncompressed of 64 MiB (QA-2; was ~20 MB in sprint 3). Static assets 5,293 files of 20,000.
- Worker CPU on production sample: all `ok`, `cpuTime` 0 ms (QA-2).
- apps/web unit tests: 511 in 44 files; e2e 14 scenarios / 90 steps, green locally and against `next.growgen.xyz` (QA-2).
- Security audit QA-4: 15 findings (1 critical, 4 high); all agent-side items closed in SEC-01, SEC-02 and SEC-198.

## Keep

- **One parity oracle** (`apps/web/tests/legacy-urls.txt`) plus build guards (`check-static-routes`, route-parity, empty-build). No URL regression reached production.
- **Cross-model review.** A different model re-reviewing with live probes caught the real blockers (admin container would not boot, production-gate bypasses, OOM in MIG-4, mixed-model embeddings).
- **Independent security audit before go-live** (QA-4): it found that the 73 EmDash `public.*` tables were reachable through the Supabase Data API (SEC-01).
- **Fail-closed switches**: `PUBLIC_SITE_LIVE` exact `true`, `SETUP_TOKEN` gate, Access check before EmDash, `DERIVE_READONLY=1` CI.
- **Owner checklist tickets** (`human` label, the GON-199 tracker): owner-only steps stayed visible and ordered.
- `knowledge.md` entries per story, dated with IDs.

## Problem (root cause)

1. **Stacked PRs merged into a dead base.** PR #227 (GON-255) merged into the squash-merged `emdash/gon-254-*` branch and never reached `master`, while Linear said Done. Root cause: GitHub doesn't retarget a stacked PR after a squash merge. Re-landed as #230.
2. **Agents and secrets.** A builder copied the gitignored `.env` into its worktree so a build could reach the DB (GON-240). Root cause: the prompt didn't forbid it, and the build needed DB access the worktree didn't have.
3. **Agent tool gaps.** The `tester` agent has no Linear tools, so an overnight run (GON-179) left its comment and two bug tickets for the lead.
4. **Analytics rule vs reality.** QA-2 found GoatCounter loading on every page of the not-yet-live site, against the "no analytics before live" rule. Root cause: GoatCounter was ported without the live gate. Fixed by dropping it (GON-239).
5. **Embedding provider drift.** Derive supported two providers (LM Studio on the owner's Mac, Workers AI). GON-255 retired LM Studio, so derive keys vectors to the Workers AI model only; if production rows still come from LM Studio, every deploy logs "model switch incomplete" (output unchanged, but the warning hides real gaps). Re-keying is DATA-3, still open; `web-deploy` has no Workers AI credentials.
6. **Docker data disk.** Docker Desktop silently created an empty disk when the sparse bundle on MacData wasn't mounted, which looked like lost containers.
7. **Docs lag the code.** CUT-2 reviews found stale paths in `CLAUDE.md`, `AGENTS.md`, skills and `PORTING.md` (fixed in CUT-3).

## Try (for the next project in this repo)

- Retarget stacked PRs to `master` before merging; verify with `git merge-base --is-ancestor <sha> origin/master` before closing a ticket.
- Every builder prompt says "don't read or copy `.env`"; check worktrees with `find . -maxdepth 3 -name .env` afterwards.
- Pick one embedding provider per environment up front and store the model id with each vector.
- Update docs and skills in the same PR that moves or deletes the paths they name.
- Keep the QA-4 style audit and the cross-model review as gates for anything that touches secrets, roles or the public Worker.

## Action items

| Action                                                                                                              | Owner           |
| ------------------------------------------------------------------------------------------------------------------- | --------------- |
| DATA-3: re-key production embeddings to Workers AI (GON-263)                                                        | claude-opus-5.5 |
| Markdown widget for `body_md` (GON-249)                                                                             | claude-opus-5.5 |
| Watch Workers Free requests/day and CPU, Supabase size and 7-day pause, Cloudinary credits for the first weeks live | owner           |
| Keep the nightly backup and do a restore drill again after the next `emdash migrate`                                | owner           |
