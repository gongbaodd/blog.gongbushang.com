import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import { buildLink, checkInteractive, EXPIRY_MS, mintToken, REDIRECT, validateOrigin } from "./signin-link-lib.mjs";

describe("signin-link", () => {
	it("expires within 5 minutes", () => {
		expect(EXPIRY_MS).toBeLessThanOrEqual(5 * 60 * 1000);
	});
	it("mints 32 random bytes and stores only the sha256 base64url hash, never the token", () => {
		const a = mintToken();
		const b = mintToken();
		expect(a.token).not.toBe(b.token);
		const bytes = Buffer.from(a.token, "base64url");
		expect(bytes.length).toBe(32);
		expect(a.hash).toBe(createHash("sha256").update(bytes).digest("base64url"));
		expect(a.hash).not.toBe(a.token);
	});
	it("builds a verify link with a fixed redirect", () => {
		const u = new URL(buildLink("https://admin.growgen.xyz", "tok"));
		expect(u.origin).toBe("https://admin.growgen.xyz");
		expect(u.pathname).toBe("/_emdash/api/auth/magic-link/verify");
		expect(u.searchParams.get("token")).toBe("tok");
		expect(u.searchParams.get("redirect")).toBe(REDIRECT);
	});
	it("accepts only allowlisted bare origins", () => {
		expect(validateOrigin("https://admin.growgen.xyz").ok).toBe(true);
		expect(validateOrigin("http://localhost:4322").ok).toBe(true);
		for (const bad of [
			"https://evil.example",
			"http://admin.growgen.xyz",
			"https://admin.growgen.xyz@evil.example",
			"https://user:p@admin.growgen.xyz",
			"https://admin.growgen.xyz/x",
			"https://admin.growgen.xyz/?a=1",
			"nope",
			"",
		]) {
			expect(validateOrigin(bad).ok, bad).toBe(false);
		}
		expect(validateOrigin("https://other.example", { SIGNIN_LINK_EXTRA_ORIGINS: "https://other.example" }).ok).toBe(true);
	});
	it("refuses CI and non-terminal stdout", () => {
		expect(checkInteractive({ stdoutIsTTY: true, env: {} }).ok).toBe(true);
		expect(checkInteractive({ stdoutIsTTY: false, env: {} }).ok).toBe(false);
		expect(checkInteractive({ stdoutIsTTY: true, env: { CI: "true" } }).ok).toBe(false);
		expect(checkInteractive({ stdoutIsTTY: true, env: { GITHUB_ACTIONS: "true" } }).ok).toBe(false);
	});
	it("script never logs the token, writes files or serves HTTP, and clears old links in a transaction", () => {
		const src = readFileSync(new URL("./signin-link.mjs", import.meta.url), "utf8");
		expect(src).not.toMatch(/writeFile|appendFile|createServer|fetch\(/);
		expect(src).not.toMatch(/console\.(error|warn)\([^)]*\btoken\b/);
		expect(src).toMatch(/begin[\s\S]*delete from public\.auth_tokens[\s\S]*insert into public\.auth_tokens[\s\S]*commit/);
		expect(src).toMatch(/--yes-production/);
	});
});
