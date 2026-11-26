---
name: linear
description: Manage issues, projects & team workflows in Linear. Use when the user wants to read, create or updates tickets in Linear.
metadata:
  short-description: Manage Linear issues in Codex
---

# Linear

## Overview

This skill provides a structured workflow for managing issues, projects & team workflows in Linear. It ensures consistent integration with the Linear MCP server, which offers natural-language project management for issues, projects, documentation, and team collaboration.

## Project rules (this repo)

These rules apply to every agent that reads or writes Linear for this repo. Team key is `GON`; the EmDash migration lives in project `P-GON-6`.

### Agent labels

Every open issue carries **exactly one** label from the workspace label group `Agent`. Linear makes labels in a group mutually exclusive, so setting a new one replaces the old one.

| Label | Who | Give it |
| --- | --- | --- |
| `claude-opus-5.5` | Claude Code, Opus 5.5 | Design, security (SEC-*), Supabase/RLS, infra, cutover, cross-cutting changes, anything unclear. **Default.** |
| `claude-sonnet-5.5` | Claude Code, Sonnet 5.5 | Well-specified, mechanical or bulk work: content import, renames, test backfill, doc updates. |
| `agy-neon-4` | Antigravity (`agy`), `gemini-4-neon-high`/`-xhigh` | Plan reviews, code reviews and second opinions on another agent's work. |
| `agy-hydrogen-4` | Antigravity (`agy`), `gemini-4-hydrogen-high`/`-xhigh` | Research and analysis: free-tier limits, library comparisons, root-cause digging. |
| `human` | The owner | Dashboard clicks, secrets and tokens, billing, DNS, OAuth logins, merges to protected branches, anything an agent must not do. |

Rules:

1. **Label on creation.** Pass the agent label in `labels` when calling `save_issue`. If unsure, use `claude-opus-5.5`.
2. **Only work your own label.** When asked to "pick up the next issue", filter `list_issues` by your label. Don't start an issue labelled for another agent unless the user tells you to.
3. **Hand off by relabelling.** To pass an issue on, switch the label in one `save_issue` call (`removeLabels` the old agent label, `addLabels` the new one) and add a comment saying why and what is left. Never leave an issue without an `Agent` label.
4. **Split mixed work.** If an issue needs both an agent and the owner (for example code plus a dashboard setting), make a `human` sub-issue for the owner's part and mark it as blocking.
5. **Reviews are their own issue.** A review of GON-123 is a new sub-issue labelled with the reviewer (usually `agy-neon-4`). The reviewer posts findings as a comment on it, not by editing the parent.
6. **Keep type labels too.** `Agent` labels sit alongside `Bug` / `Feature` / `Improvement`. Use `addLabels`/`removeLabels`, never `labels`, when updating, so you don't drop the other labels.
7. **Reference the issue.** Branch names, commit subjects and PR titles include the issue ID, for example `fix(web): ... (GON-204)`.
8. **Sign your comments.** All agents post through the owner's Linear account, so the author field doesn't say who wrote a comment. Start every comment you post (`save_comment`) with your own `Agent` label in bold, followed by a blank line. Example: `**[claude-opus-5.5]**`. Use the label of the agent that writes the comment, not the label on the issue. The owner's comments are not signed.
9. **New agent or model.** Create the child label under `Agent` first (lowercase `<tool>-<model>-<version>`, such as `codex-gpt-6`), then add a row to the table above in the same change.

## Prerequisites
- Linear MCP server must be connected and accessible via OAuth
- Confirm access to the relevant Linear workspace, teams, and projects

## Required Workflow

**Follow these steps in order. Do not skip steps.**

### Step 0: Set up Linear MCP (if not already configured)

If any MCP call fails because Linear MCP is not connected, pause and set it up:

1. Add the Linear MCP:
   - `codex mcp add linear --url https://mcp.linear.app/mcp`
2. Enable remote MCP client:
   - Set `[features] rmcp_client = true` in `config.toml` **or** run `codex --enable rmcp_client`
3. Log in with OAuth:
   - `codex mcp login linear`

After successful login, the user will have to restart codex. You should finish your answer and tell them so when they try again they can continue with Step 1.

**Windows/WSL note:** If you see connection errors on Windows, try configuring the Linear MCP to run via WSL:
```json
{"mcpServers": {"linear": {"command": "wsl", "args": ["npx", "-y", "mcp-remote", "https://mcp.linear.app/sse", "--transport", "sse-only"]}}}
```

### Step 1
Clarify the user's goal and scope (e.g., issue triage, sprint planning, documentation audit, workload balance). Confirm team/project, priority, labels, cycle, and due dates as needed.

### Step 2
Select the appropriate workflow (see Practical Workflows below) and identify the Linear MCP tools you will need. Confirm required identifiers (issue ID, project ID, team key) before calling tools.

### Step 3
Execute Linear MCP tool calls in logical batches:
- Read first (list/get/search) to build context.
- Create or update next (issues, projects, labels, comments) with all required fields.
- For bulk operations, explain the grouping logic before applying changes.

### Step 4
Summarize results, call out remaining gaps or blockers, and propose next actions (additional issues, label changes, assignments, or follow-up comments).

## Available Tools

Issue Management: `list_issues`, `get_issue`, `create_issue`, `update_issue`, `list_my_issues`, `list_issue_statuses`, `list_issue_labels`, `create_issue_label`

Project & Team: `list_projects`, `get_project`, `create_project`, `update_project`, `list_teams`, `get_team`, `list_users`

Documentation & Collaboration: `list_documents`, `get_document`, `search_documentation`, `list_comments`, `create_comment`, `list_cycles`

## Practical Workflows

- Sprint Planning: Review open issues for a target team, pick top items by priority, and create a new cycle (e.g., "Q1 Performance Sprint") with assignments.
- Bug Triage: List critical/high-priority bugs, rank by user impact, and move the top items to "In Progress."
- Documentation Audit: Search documentation (e.g., API auth), then open labeled "documentation" issues for gaps or outdated sections with detailed fixes.
- Team Workload Balance: Group active issues by assignee, flag anyone with high load, and suggest or apply redistributions.
- Release Planning: Create a project (e.g., "v2.0 Release") with milestones (feature freeze, beta, docs, launch) and generate issues with estimates.
- Cross-Project Dependencies: Find all "blocked" issues, identify blockers, and create linked issues if missing.
- Automated Status Updates: Find your issues with stale updates and add status comments based on current state/blockers.
- Smart Labeling: Analyze unlabeled issues, suggest/apply labels, and create missing label categories.
- Sprint Retrospectives: Generate a report for the last completed cycle, note completed vs. pushed work, and open discussion issues for patterns.

## Tips for Maximum Productivity

- Batch operations for related changes; consider smart templates for recurring issue structures.
- Use natural queries when possible ("Show me what John is working on this week").
- Leverage context: reference prior issues in new requests.
- Break large updates into smaller batches to avoid rate limits; cache or reuse filters when listing frequently.

## Troubleshooting

- Authentication: Clear browser cookies, re-run OAuth, verify workspace permissions, ensure API access is enabled.
- Tool Calling Errors: Confirm the model supports multiple tool calls, provide all required fields, and split complex requests.
- Missing Data: Refresh token, verify workspace access, check for archived projects, and confirm correct team selection.
- Performance: Remember Linear API rate limits; batch bulk operations, use specific filters, or cache frequent queries.
