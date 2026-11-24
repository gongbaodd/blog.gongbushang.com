# Agent rules: EmDash migration

Every agent on the migration reads this file first. The plan is `docs/plan/emdash-migration-plan.md`. Decisions D1–D10 and the free-tier budget in §10 are binding. To change one, raise it with Lead; don't work around it.

## Hard rules
1. **Wheel first.** Before writing code for a story, read the Scout note `docs/plan/emdash/scout/<story-id>.md`. If it says an existing package, CLI command or plugin covers the need, use it. Custom code is glue only.
2. **Free plans only.** Nothing may require a paid tier of Cloudflare, Supabase, Cloudinary or GitHub. Watch the 3 MB Worker script size, the 100k Worker requests/day, Supabase's 500 MB DB and 7-day pause, and Cloudinary's 25 credits.
3. **URLs never change.** Public paths must match `apps/web/tests/legacy-urls.txt` once MIG-0 creates it.
4. **Secrets.** Never print, commit or paste secrets. Read them from the repo-root `.env`, `apps/web/.dev.vars`, wrangler secrets or GitHub environment secrets, and refer to them only by variable name.
5. **No outward-facing actions without Lead.** Creating cloud projects, DNS, custom domains, production deploys and deleting remote resources all go through Lead, who asks the owner.
6. **Stay in your lane.** Edit only the paths your agent definition owns. Hand anything else to Lead.
7. **Environments** are `local` (Supabase via `supabase start`), `testing`, and `production`. Never call production "public".

## Story workflow
1. Lead assigns `<story-id>`. Work on branch `emdash/<story-id>`, cut from `feat/emdash`, in a git worktree if another builder is active.
2. Mark the story `active` in the Gantt chart (§6 of the plan): add `active, ` after the colon on that story's line.
3. Implement. Keep `apps/web/TEMPLATE_DIFF.md` updated whenever you change a file the EmDash template generated.
4. Run the checks for the story (build, unit tests, plus whatever the story names). Tester re-runs them independently.
5. Hand back to Lead with a summary: what changed, the commands run and their results, and anything left open.
6. After merge, mark the story `done, ` in the Gantt chart. Archivist then appends lessons to `docs/plan/emdash/knowledge.md`.

## Commits
Conventional commits (`feat(web): …`, `chore(infra): …`), ending with:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (Lead's sessions) or the attribution line your harness provides.

## Where things live
| What | Path |
|---|---|
| New site (single package) | `apps/web/` |
| Supabase local project | `supabase/` |
| Scout notes | `docs/plan/emdash/scout/` |
| Runbooks | `docs/plan/emdash/runbooks/` |
| Retros and knowledge | `docs/plan/emdash/retro/`, `docs/plan/emdash/knowledge.md` |
| Gemini review prompt | `docs/plan/emdash/agy-review.md` |
