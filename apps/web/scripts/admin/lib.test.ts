import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import { buildDevVars, GENERATED_HEADER, redact, resolveEnv, serializeDevVars } from "./lib.mjs";

const dotEnv = {
	SUPABASE_TESTING_POOLER_URL: "postgresql://u:pw@aws-0.pooler.supabase.com:5432/postgres",
	EMDASH_TESTING_ENCRYPTION_KEY: "emdash_enc_v1_TESTKEYTESTKEYTESTKEY",
	GITHUB_DISPATCH_TOKEN: "ghp_envfiletoken",
};
const devVars = {
	CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
	GITHUB_API_URL: "http://127.0.0.1:9999",
	GITHUB_DISPATCH_TOKEN: "ghp_devvarstoken",
	GITHUB_DISPATCH_REPO: "o/r",
	CLOUDINARY_CLOUD_NAME: "cloud",
	EMDASH_ENCRYPTION_KEY: "localkeylocalkeylocalkey",
};

describe("resolveEnv", () => {
	it("testing uses the pooler url and testing key", () => {
		const r = resolveEnv("testing", dotEnv, devVars);
		expect(r).toMatchObject({ ok: true, url: dotEnv.SUPABASE_TESTING_POOLER_URL, key: dotEnv.EMDASH_TESTING_ENCRYPTION_KEY });
	});
	it("production fails naming the missing variables and never invents a key", () => {
		const r = resolveEnv("production", dotEnv, devVars);
		expect(r.ok).toBe(false);
		expect(r.missing).toEqual(["SUPABASE_PRODUCTION_POOLER_URL", "EMDASH_PRODUCTION_ENCRYPTION_KEY"]);
	});
	it("production with a url but no key still fails on the key", () => {
		const r = resolveEnv("production", { SUPABASE_PRODUCTION_POOLER_URL: "postgresql://a:b@h:5432/p" }, devVars);
		expect(r.missing).toEqual(["EMDASH_PRODUCTION_ENCRYPTION_KEY"]);
	});
	it("local defaults to the Supabase local stack and may lack a key", () => {
		const r = resolveEnv("local", {}, {});
		expect(r).toMatchObject({ ok: true, url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
		expect(r.key).toBeUndefined();
	});
});

describe("buildDevVars", () => {
	it("forces the env's DB and SITE_ENV, ignoring the .dev.vars DB entry", () => {
		const v = buildDevVars("testing", resolveEnv("testing", dotEnv, devVars), dotEnv, devVars);
		expect(v.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE).toBe(dotEnv.SUPABASE_TESTING_POOLER_URL);
		expect(v.SITE_ENV).toBe("testing");
		expect(v.EMDASH_ENCRYPTION_KEY).toBe(dotEnv.EMDASH_TESTING_ENCRYPTION_KEY);
	});
	it("takes the dispatch token from .env over .dev.vars, repo from .dev.vars", () => {
		const v = buildDevVars("testing", resolveEnv("testing", dotEnv, devVars), dotEnv, devVars);
		expect(v.GITHUB_DISPATCH_TOKEN).toBe("ghp_envfiletoken");
		expect(v.GITHUB_DISPATCH_REPO).toBe("o/r");
	});
	it("honours a fake GITHUB_API_URL only for local, so testing/production dispatch to real GitHub", () => {
		const t = buildDevVars("testing", resolveEnv("testing", dotEnv, devVars), dotEnv, devVars);
		const l = buildDevVars("local", resolveEnv("local", {}, devVars), {}, devVars);
		expect(t.GITHUB_API_URL).toBeUndefined();
		expect(l.GITHUB_API_URL).toBe("http://127.0.0.1:9999");
	});
	it("serialises with the generated header", () => {
		expect(serializeDevVars({ A: "b" }).startsWith(GENERATED_HEADER)).toBe(true);
	});
});

describe("redact", () => {
	it("hides postgres urls and secret values", () => {
		const out = redact("connect postgresql://u:pw@h:5432/p with ghp_envfiletoken ok", ["ghp_envfiletoken"]);
		expect(out).not.toMatch(/pw@|ghp_/);
	});
});
