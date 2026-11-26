import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import { adminBrowserUrl, productionLaunchGate } from "./lib.mjs";

const START = resolve(import.meta.dirname, "start.mjs");

describe("admin launcher hardening (SEC-07)", () => {
	it("prints a localhost URL, never 127.0.0.1 (WebAuthn RP ID)", () => {
		expect(adminBrowserUrl(4322)).toBe("http://localhost:4322");
		expect(adminBrowserUrl(4333)).not.toContain("127.0.0.1");
	});

	it("local needs no flags", () => {
		expect(productionLaunchGate("local", [])).toEqual({ ok: true });
	});

	it("production without --yes-production is refused as deprecated, pointing at the Docker admin", () => {
		const g = productionLaunchGate("production", []);
		expect(g.ok).toBe(false);
		expect(g.message).toMatch(/DEPRECATED/);
		expect(g.message).toMatch(/admin-docker\.md/);
	});

	it("production with only --yes-production is still refused (dev-bypass)", () => {
		const g = productionLaunchGate("production", ["yes-production"]);
		expect(g.ok).toBe(false);
		expect(g.message).toMatch(/dev-bypass/);
		expect(g.message).toMatch(/--unsafe-dev-server/);
	});

	it("production with both flags runs with a loud warning", () => {
		const g = productionLaunchGate("production", ["yes-production", "unsafe-dev-server"]);
		expect(g.ok).toBe(true);
		expect(g.warning).toMatch(/dev-bypass/);
		expect(g.warning).toMatch(/admin:stop/);
	});

	it("start.mjs refuses production before reading any env file or starting a server", () => {
		const env = { PATH: process.env.PATH ?? "", GROWGEN_ENV_FILE: "/nonexistent/.env" };
		const plain = spawnSync(process.execPath, [START, "production"], { encoding: "utf8", env });
		expect(plain.status).toBe(2);
		expect(plain.stderr).toMatch(/DEPRECATED/);
		const yes = spawnSync(process.execPath, [START, "production", "--yes-production"], { encoding: "utf8", env });
		expect(yes.status).toBe(2);
		expect(yes.stderr).toMatch(/dev-bypass/);
	});
});
