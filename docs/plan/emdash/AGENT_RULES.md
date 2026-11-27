# Agent rules: EmDash migration

Every agent on the migration reads this file first. The plan and story backlog live in Linear: project [Blog (`P-GON-6`)](https://linear.app/gongbaodd/project/blog-fc8994e42e5e) and document [EmDash Migration Plan (v3)](https://linear.app/gongbaodd/document/emdash-migration-plan-v3-732d5d1b3cf3) (stub & story ID index in `docs/plan/emdash-migration-plan.md`). Decisions D1–D13 and the free-tier budget are binding. To change one, raise it with Lead; don't work around it.

## Hard rules
1. **Wheel first.** Before writing code for a story, read the Scout note `docs/plan/emdash/scout/<story-id>.md`. If it says an existing package, CLI command or plugin covers the need, use it. Custom code is glue only.
2. **Free plans only.** R2 and Cloudflare Images are not used. Supabase is reached from outside Cloudflare only through the IPv4 session pooler. Nothing may require a paid tier of Cloudflare, Supabase, Cloudinary or GitHub. Watch the **10 ms CPU per Worker invocation** (the main risk), the 64 MiB uncompressed script size, 20,000 static-asset files, the 100k Worker requests/day, Supabase's 500 MB DB and 7-day pause, and Cloudinary's 25 credits.
3. **URLs never change.** Public paths must match `apps/web/tests/legacy-urls.txt` once MIG-0 creates it.
4. **Secrets.** Never print, commit or paste secrets. Read them from the repo-root `.env`, `apps/web/.dev.vars`, wrangler secrets or GitHub environment secrets, and refer to them only by variable name.
5. **No outward-facing actions without Lead.** Creating cloud projects, DNS, custom domains, production deploys and deleting remote resources all go through Lead, who asks the owner.
6. **Stay in your lane.** Edit only the paths your agent definition owns. Hand anything else to Lead.
7. **Environments** are `local` (Supabase via `supabase start`) and `production` (INF-10 retired `testing`; the former testing resources were promoted). Never call production "public": the production Worker (`growgen-web`) stays noindex until the owner sets `PUBLIC_SITE_LIVE=true` at CUT-1; the only public hostname is `growgen.xyz` (no `www`, no `next.`). PR CI reads the production database read-only (`DERIVE_READONLY=1`) and never writes to it.

## Story workflow
1. Lead assigns `<story-id>` (Linear issue `GON-*` in project `P-GON-6`). Work on branch `emdash/<story-id>`, cut from `master`, in a git worktree if another builder is active.
2. Move the story's Linear issue to **In Progress**.
3. Implement. Keep `apps/web/TEMPLATE_DIFF.md` updated whenever you change a file the EmDash template generated.
4. Run the checks for the story (build, unit tests, plus whatever the story names). Tester re-runs them independently.
5. Hand back to Lead (moving the Linear issue to **In Review**) with a summary: what changed, the commands run and their results, and anything left open.
6. After merge, move the Linear issue to **Done**. Archivist then appends lessons to `docs/plan/emdash/knowledge.md`.

## Commits
Conventional commits (`feat(web): …`, `chore(infra): …`), ending with:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (Lead's sessions) or the attribution line your harness provides.

## Where things live
| What | Path |
|---|---|
| Plan & backlog | Linear project [Blog (`P-GON-6`)](https://linear.app/gongbaodd/project/blog-fc8994e42e5e) (index in `docs/plan/emdash-migration-plan.md`) |
| New public site | `apps/web/` |
| Dockerized Node admin (INF-9) | `apps/admin/` |
| Supabase local project | `supabase/` |
| Scout notes | `docs/plan/emdash/scout/` |
| Runbooks | `docs/plan/emdash/runbooks/` |
| Retros and knowledge | `docs/plan/emdash/retro/`, `docs/plan/emdash/knowledge.md` |
| Gemini review prompt | `docs/plan/emdash/agy-review.md` |
