# Reviewer-Gemini: agy review prompt

Lead runs these reviews through the `cc-suite:agy` skill (`/cc-suite:agy --model <model> --sandbox read-only <prompt>`), or directly with the cc-suite runner:

```bash
node ~/.claude/plugins/cache/xiaolai/cc-suite/2.5.0/scripts/agy-runner.mjs \
  --kind agy --model gemini-4-hydrogen-high --sandbox read-only \
  --timeout-ms 600000 --summary "review <story-id>" -- "<prompt below>"
```

Which model to use (plan §3.2; S0-7 may change it):

| Job | Model |
|---|---|
| PR / story review | `gemini-4-hydrogen-high` |
| Plan, security, cutover review | `gemini-4-neon-xhigh` |
| Bulk sweeps (HTML diffs, URL lists) | `gemini-3.8-flash-medium` |
| Tie-break against Claude | `gpt-oss-120b-medium` |

## Prompt template

```
You are an independent reviewer for a migration of an Astro blog to the EmDash CMS
(Cloudflare Workers + Supabase Postgres via Hyperdrive + Cloudinary, all on FREE plans).
Read docs/plan/emdash-migration-plan.md (decisions D1–D10, §10 free-tier budget) and
docs/plan/emdash/AGENT_RULES.md.

Review story <STORY-ID>: <one-line goal>.
Diff: run `git diff feat/emdash...emdash/<STORY-ID>` (read-only).

Report ONLY concrete problems, most severe first, each as:
- [severity: blocker|major|minor] file:line — what is wrong — the concrete scenario where it breaks.
Check specifically: correctness; secrets leakage; anything needing a paid tier; public URL
changes; custom code where an existing EmDash/npm feature exists; prerender vs SSR mistakes;
Postgres/Hyperdrive incompatibilities.
If you find nothing, say "No findings". Do not restate the diff. Do not suggest style nits.
```

## Temporary: Claude reviewers while agy is rate-limited (owner, 2026-11-25)
Stories waiting in Linear **In Review** are reviewed by Claude subagents using the prompt template above. A story is never reviewed by the model that built it: Gemini-built swarm branches get Sonnet or Opus, and Claude-Sonnet-built stories get Opus. Each reviewer does a trial merge onto `feat/emdash` in its own worktree, runs the story's checks, and reports findings in the template's format. Lead posts the findings to the Linear issue, gets fixes made, merges, and moves the issue to Done. Switch back to agy once its limit resets.
