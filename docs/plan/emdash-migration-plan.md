# EmDash Migration Plan

> **Moved to Linear on 2026-11-25.** Linear is now the source of truth for the migration plan, decisions, milestones, and story tracking.

- **Linear Project:** [Blog (`P-GON-6`)](https://linear.app/gongbaodd/project/blog-fc8994e42e5e)
- **Full Plan Document (v3):** [EmDash Migration Plan (v3)](https://linear.app/gongbaodd/document/emdash-migration-plan-v3-732d5d1b3cf3)
- **Team:** `Gongbaodd` (`GON`) · **Integration branch:** `feat/emdash`

Supporting local artifacts remain in [`docs/plan/emdash/`](./emdash/):
- Agent rules: [`docs/plan/emdash/AGENT_RULES.md`](./emdash/AGENT_RULES.md)
- Knowledge base: [`docs/plan/emdash/knowledge.md`](./emdash/knowledge.md)
- Scout notes, runbooks, retros, and reports: `docs/plan/emdash/{scout,runbooks,retro,reports}/`

## Story → Linear Issue Index

| Epic / Milestone | Stories |
|---|---|
| **E0: Foundation and spikes** | `S0-1` (`GON-139`), `S0-2` (`GON-140`), `S0-3` (`GON-141`), `S0-4` (`GON-142`), `S0-5` (`GON-143`), `S0-6` (`GON-144`), `S0-7` (`GON-145`), `S0-8` (`GON-146`), `FIX-1` (`GON-147`) |
| **E1: Environments and infrastructure** | `INF-1` (`GON-148`), `INF-2` (`GON-149`), `INF-3` (`GON-150`), `INF-4` (`GON-151`), `INF-5` (`GON-152`), `INF-6` (`GON-153`), `INF-7` (`GON-154`), `INF-8` (`GON-155`), `INF-9` (`GON-156`), `INF-10` (`GON-202`: collapse environments to local + production) |
| **E2: CMS model and media** | `CMS-1` (`GON-157`), `CMS-2` (`GON-158`), `CMS-3` (`GON-159`), `CMS-4` (`GON-160`) |
| **E3: Content migration** | `MIG-0` (`GON-161`), `MIG-2` (`GON-162`), `MIG-1` (`GON-163`), `MIG-3` (`GON-164`), `MIG-4` (`GON-165`), `MIG-5` (`GON-166`) |
| **E4: Port features into `apps/web`** | `PORT-1` (`GON-167`), `PORT-2` (`GON-168`), `PORT-3` (`GON-169`), `PORT-4` (`GON-170`), `PORT-5` (`GON-171`), `PORT-6` (`GON-172`), `PORT-7` (`GON-173`), `PORT-8` (`GON-174`), `PORT-8b` (`GON-175`), `DATA-1` (`GON-176`), `PORT-9` (`GON-177`) |
| **E5: Quality, soak, cutover** | `QA-1` (`GON-178`), `QA-2` (`GON-179`), `QA-3` (`GON-180`), `QA-4` (`GON-181`), `SOAK-1` (`GON-182`), `CUT-1` (`GON-183`), `CUT-2` (`GON-184`), `CUT-3` (`GON-185`) |
| **Icebox** | `BL-PT` (`GON-186`), `BL-COMMENTS` (`GON-187`), `BL-I18N` (`GON-188`), `BL-SEARCH` (`GON-189`), `BL-TRIM` (`GON-190`) |
