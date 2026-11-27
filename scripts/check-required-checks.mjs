#!/usr/bin/env node
// GON-246: static guard against required checks that never report on a PR.
//
// A required check waits forever on a PR when the workflow producing it never starts. That happens when the workflow's
// `pull_request` trigger has a workflow-level `paths:`/`paths-ignore:`/`branches:` filter that excludes the PR.
// This script fails when, for any name in .github/required-checks.json:
//   1. no job in .github/workflows/*.yml produces that check name (job `name:`, else the job id), or
//   2. the producing workflow has no `pull_request` trigger, or its `pull_request` trigger filters out PRs to master.
// Only `pull_request` is inspected (push/schedule/dispatch triggers may filter freely).
// If GH_TOKEN/GITHUB_TOKEN can read the ruleset, the checked-in list is also compared with it (warning when unreadable).
// Zero dependencies on purpose: the CI job runs without `pnpm install`.
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "master";

// ---- minimal YAML subset parser (maps, block/flow sequences, scalars; enough for GitHub workflows) ----
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
const unquote = (s) => {
  s = s.trim();
  return s.length > 1 && /^(['"]).*\1$/.test(s) ? s.slice(1, -1) : s;
};
function scalar(v) {
  v = v.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map(unquote);
  }
  return unquote(v);
}
function splitKey(text) {
  // [key, rest] for `key: rest` / `key:`; null when not a mapping line
  let q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === ":" && (i === text.length - 1 || text[i + 1] === " ")) return [unquote(text.slice(0, i)), text.slice(i + 1).trim()];
  }
  return null;
}
const isDash = (l) => /^-(\s|$)/.test(l.trimStart());

export function parseYaml(src) {
  const raw = src.split("\n");
  // Drop block-scalar bodies (run: |, etc.) before comment stripping so `#` inside scripts is irrelevant.
  const lines = [];
  const indentOf = (l) => l.length - l.trimStart().length;
  for (let n = 0; n < raw.length; n++) {
    const l = raw[n].replace(/\s+$/, "");
    if (l.trim() === "" ) continue;
    const s = stripComment(l).replace(/\s+$/, "");
    if (s.trim() === "" || s.trim() === "---") continue;
    lines.push(s);
    if (/:\s*[|>][+-]?\d*$/.test(s) || /^\s*-\s+[|>][+-]?\d*$/.test(s)) {
      const base = indentOf(s);
      while (n + 1 < raw.length && (raw[n + 1].trim() === "" || indentOf(raw[n + 1]) > base)) n++;
    }
  }
  let i = 0;
  function block(indent) {
    return isDash(lines[i]) ? seq(indent) : map(indent);
  }
  function seq(indent) {
    const out = [];
    while (i < lines.length && indentOf(lines[i]) === indent && isDash(lines[i])) {
      const rest = lines[i].trimStart().slice(1).trim();
      if (rest === "") {
        i++;
        out.push(i < lines.length && indentOf(lines[i]) > indent ? block(indentOf(lines[i])) : null);
      } else if (splitKey(rest) && !/^["'[{]/.test(rest)) {
        lines[i] = " ".repeat(indent + 2) + rest;
        out.push(map(indent + 2));
      } else {
        i++;
        out.push(scalar(rest));
      }
    }
    return out;
  }
  function map(indent) {
    const out = {};
    while (i < lines.length && indentOf(lines[i]) === indent && !isDash(lines[i])) {
      const kv = splitKey(lines[i].trim());
      i++;
      if (!kv) continue;
      const [k, v] = kv;
      if (v === "") {
        if (i < lines.length && indentOf(lines[i]) > indent) out[k] = block(indentOf(lines[i]));
        else if (i < lines.length && indentOf(lines[i]) === indent && isDash(lines[i])) out[k] = seq(indent);
        else out[k] = null;
      } else if (/^[|>][+-]?\d*$/.test(v)) out[k] = "";
      else out[k] = scalar(v);
    }
    return out;
  }
  if (!lines.length) return {};
  return block(indentOf(lines[0]));
}

// ---- guard logic ----
const asList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

function globMatches(pattern, name) {
  // GitHub filter globs: `*` = no slash, `**` = anything.
  const re = pattern
    .split("**")
    .map((p) => p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`).test(name);
}

/** The `pull_request` trigger config: undefined when absent, {} when bare, else the object. */
export function pullRequestTrigger(workflow) {
  const on = workflow.on;
  if (on == null) return undefined;
  if (typeof on === "string") return on === "pull_request" ? {} : undefined;
  if (Array.isArray(on)) return on.includes("pull_request") ? {} : undefined;
  if (typeof on === "object" && "pull_request" in on) return on.pull_request ?? {};
  return undefined;
}

export function checkNamesOf(workflow) {
  return Object.entries(workflow.jobs ?? {}).map(([id, job]) => ({ id, name: (job && job.name) || id }));
}

/** @returns {string[]} error messages (empty when OK) */
export function checkWorkflows(workflows, required) {
  const errors = [];
  for (const name of required) {
    const producers = workflows.filter((w) => checkNamesOf(w.doc).some((j) => j.name === name));
    if (!producers.length) {
      errors.push(`required check "${name}" matches no job name in .github/workflows (job renamed or removed? update the ruleset and .github/required-checks.json together)`);
      continue;
    }
    for (const { file, doc } of producers) {
      const pr = pullRequestTrigger(doc);
      if (pr === undefined) {
        errors.push(`${file}: produces required check "${name}" but has no \`pull_request\` trigger, so it never reports on a PR`);
        continue;
      }
      for (const key of ["paths", "paths-ignore"]) {
        if (asList(pr[key]).length)
          errors.push(`${file}: workflow-level \`pull_request.${key}\` on a required-check workflow ("${name}"): a PR outside these paths never starts the workflow and "${name}" waits forever. Remove it and filter with a \`changes\` job + job-level \`if:\` (see docs/plan/emdash/runbooks/ci.md)`);
      }
      const branches = asList(pr.branches);
      if (branches.length && !branches.some((b) => globMatches(b, BASE)))
        errors.push(`${file}: \`pull_request.branches\` ${JSON.stringify(branches)} does not match ${BASE}, so PRs to ${BASE} never trigger "${name}"`);
      if (asList(pr["branches-ignore"]).some((b) => globMatches(b, BASE)))
        errors.push(`${file}: \`pull_request.branches-ignore\` excludes ${BASE}`);
    }
  }
  return errors;
}

export function loadWorkflows(dir) {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ file: `.github/workflows/${f}`, doc: parseYaml(readFileSync(join(dir, f), "utf8")) }));
}

export function loadRequired(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function rulesetChecks(repo, id) {
  const out = execFileSync("gh", ["api", `repos/${repo}/rulesets/${id}`, "--jq", '[.rules[]|select(.type=="required_status_checks")|.parameters.required_status_checks[].context]'], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

function main() {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  const cfg = loadRequired(join(root, ".github/required-checks.json"));
  const errors = checkWorkflows(loadWorkflows(join(root, ".github/workflows")), cfg.checks);
  const repo = process.env.GITHUB_REPOSITORY;
  if (repo && (process.env.GH_TOKEN || process.env.GITHUB_TOKEN)) {
    try {
      const live = rulesetChecks(repo, cfg.ruleset).sort();
      const mine = [...cfg.checks].sort();
      if (JSON.stringify(live) !== JSON.stringify(mine)) errors.push(`.github/required-checks.json ${JSON.stringify(mine)} differs from ruleset ${cfg.ruleset} ${JSON.stringify(live)}`);
      else console.log(`ruleset ${cfg.ruleset} matches required-checks.json`);
    } catch {
      console.log(`::warning::could not read ruleset ${cfg.ruleset} with this token; compared against .github/required-checks.json only`);
    }
  }
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log(`OK: required checks ${JSON.stringify(cfg.checks)} report on every PR to ${BASE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
