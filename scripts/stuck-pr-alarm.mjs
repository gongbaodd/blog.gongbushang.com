#!/usr/bin/env node
// GON-246: stuck-PR alarm. Run hourly by .github/workflows/required-check-alarm.yml with GITHUB_TOKEN only.
// For every open, non-draft PR to master: if a required check (.github/required-checks.json) has no check run and no commit
// status on the head SHA more than STUCK_AFTER_MIN minutes after that commit, comment once per head SHA (hidden marker).
// A skipped or cancelled job still counts as "reported". Needs GH_TOKEN and GITHUB_REPOSITORY; DRY_RUN=1 only prints.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const STUCK_AFTER_MIN = 60;
export const marker = (sha) => `<!-- required-check-alarm:${sha} -->`;

/** Pure decision: which required names are missing for a PR head? */
export function missingChecks({ required, reported, commitTime, now, stuckAfterMin = STUCK_AFTER_MIN }) {
  if ((now - commitTime) / 60000 < stuckAfterMin) return [];
  const have = new Set(reported);
  return required.filter((n) => !have.has(n));
}

export function commentBody(sha, missing, minutes) {
  return `${marker(sha)}
Required check${missing.length > 1 ? "s" : ""} ${missing.map((m) => `\`${m}\``).join(", ")} ${missing.length > 1 ? "have" : "has"} not reported on \`${sha.slice(0, 7)}\` after ${minutes} minutes, so this PR cannot merge.
Likely cause: the workflow producing it has a workflow-level \`paths\`/\`branches\` filter, or its job was renamed. See \`docs/plan/emdash/runbooks/ci.md\` ("Required checks that never report"). Pushing a new commit does not help until the workflow is fixed on master. This comment is posted once per commit.`;
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const ghJson = (args) => JSON.parse(gh(args));

function reportedNames(repo, sha) {
  const runs = gh(["api", "--paginate", `repos/${repo}/commits/${sha}/check-runs?per_page=100`, "--jq", ".check_runs[].name"]).split("\n").filter(Boolean);
  const statuses = ghJson(["api", `repos/${repo}/commits/${sha}/status`]).statuses?.map((s) => s.context) ?? [];
  return [...runs, ...statuses];
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const dry = process.env.DRY_RUN === "1";
  const { checks: required } = JSON.parse(readFileSync(new URL("../.github/required-checks.json", import.meta.url), "utf8"));
  const prs = ghJson(["api", "--paginate", "--slurp", `repos/${repo}/pulls?state=open&base=master&per_page=100`]).flat();
  const now = Date.now();
  let flagged = 0;
  for (const pr of prs) {
    if (pr.draft) continue;
    const sha = pr.head.sha;
    const commitTime = Date.parse(ghJson(["api", `repos/${repo}/commits/${sha}`]).commit.committer.date);
    const missing = missingChecks({ required, reported: reportedNames(repo, sha), commitTime, now });
    if (!missing.length) continue;
    flagged++;
    const minutes = Math.round((now - commitTime) / 60000);
    console.log(`::warning::PR #${pr.number} (${sha.slice(0, 7)}): missing required check(s) ${missing.join(", ")} after ${minutes} min`);
    const comments = gh(["api", "--paginate", `repos/${repo}/issues/${pr.number}/comments?per_page=100`, "--jq", ".[].body"]);
    if (comments.includes(marker(sha))) continue;
    if (dry) { console.log(`DRY_RUN: would comment on #${pr.number}`); continue; }
    execFileSync("gh", ["api", `repos/${repo}/issues/${pr.number}/comments`, "-f", `body=${commentBody(sha, missing, minutes)}`], { stdio: "ignore" });
  }
  console.log(`checked ${prs.length} open PR(s), ${flagged} stuck`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
