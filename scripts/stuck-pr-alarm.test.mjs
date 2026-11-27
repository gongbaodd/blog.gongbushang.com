// node --test scripts/stuck-pr-alarm.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingChecks, commentBody, marker } from "./stuck-pr-alarm.mjs";

const now = Date.parse("2026-11-27T12:00:00Z");
const base = { required: ["web"], now };

test("missing check older than 1h is flagged", () => {
  assert.deepEqual(missingChecks({ ...base, reported: ["changes"], commitTime: now - 61 * 60000 }), ["web"]);
});
test("recent push is not flagged yet", () => {
  assert.deepEqual(missingChecks({ ...base, reported: [], commitTime: now - 10 * 60000 }), []);
});
test("reported check (even skipped) is not flagged", () => {
  assert.deepEqual(missingChecks({ ...base, reported: ["web", "changes"], commitTime: now - 5 * 3600000 }), []);
});
test("comment carries the per-SHA marker", () => {
  assert.ok(commentBody("abcdef1234", ["web"], 90).startsWith(marker("abcdef1234")));
});
