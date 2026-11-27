// node --test scripts/check-required-checks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkWorkflows, loadWorkflows, loadRequired, parseYaml } from "./check-required-checks.mjs";

const real = readFileSync(new URL("../.github/workflows/web-ci.yml", import.meta.url), "utf8");
const wf = (src, file = ".github/workflows/web-ci.yml") => [{ file, doc: parseYaml(src) }];

test("current repo passes", () => {
  const dir = new URL("../.github/workflows", import.meta.url).pathname;
  const cfg = loadRequired(new URL("../.github/required-checks.json", import.meta.url).pathname);
  assert.deepEqual(checkWorkflows(loadWorkflows(dir), cfg.checks), []);
});

test("parser reads web-ci jobs and trigger", () => {
  const doc = parseYaml(real);
  assert.deepEqual(Object.keys(doc.jobs), ["required-check-guard", "changes", "web"]);
  assert.deepEqual(doc.on.pull_request.branches, ["master"]);
});

test("workflow-level paths filter fails", () => {
  const src = real.replace("  pull_request:\n    branches: [master]", "  pull_request:\n    branches: [master]\n    paths:\n      - apps/web/**");
  assert.notEqual(src, real);
  const errs = checkWorkflows(wf(src), ["web"]);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /pull_request\.paths/);
});

test("paths-ignore and branches-ignore fail", () => {
  const a = real.replace("    branches: [master]", "    paths-ignore: ['docs/**']");
  assert.match(checkWorkflows(wf(a), ["web"])[0], /paths-ignore/);
  const b = real.replace("    branches: [master]", "    branches-ignore: [master]");
  assert.match(checkWorkflows(wf(b), ["web"])[0], /branches-ignore/);
});

test("branches filter not matching master fails", () => {
  const src = real.replace("branches: [master]", "branches: [release/**]");
  assert.match(checkWorkflows(wf(src), ["web"])[0], /does not match master/);
});

test("renamed web job fails", () => {
  const src = real.replace(/^ {2}web:$/m, "  web-build:");
  assert.notEqual(src, real);
  assert.match(checkWorkflows(wf(src), ["web"])[0], /matches no job name/);
});

test("job name: overrides the id", () => {
  const src = real.replace(/^ {2}web:$/m, "  build:\n    name: web");
  assert.deepEqual(checkWorkflows(wf(src), ["web"]), []);
});

test("missing pull_request trigger fails; push filters are ignored", () => {
  const noPr = real.replace("  pull_request:\n    branches: [master]\n", "");
  assert.match(checkWorkflows(wf(noPr), ["web"])[0], /no `pull_request` trigger/);
  const push = real.replace("  workflow_dispatch:", "  push:\n    branches: [master]\n    paths: ['apps/web/**']\n  workflow_dispatch:");
  assert.deepEqual(checkWorkflows(wf(push), ["web"]), []);
});
