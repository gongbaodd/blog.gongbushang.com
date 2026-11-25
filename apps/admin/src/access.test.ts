import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it, vi } from "vitest";
import { parseProjectRef as webParseProjectRef, disallowedUrlParams as webDisallowedUrlParams } from "../../web/scripts/sync/lib.mjs";
import { connectionConfig, evaluateStartup, parseProjectRef, disallowedUrlParams, sslOptionsFor } from "../scripts/safety.mjs";
import { accessMode, isLoopbackHost, teamOrigin, verifyAccessJwt } from "./access.ts";
import { PLACEHOLDER_DATABASE_URL, POOL_MAX, runtimeDialectConfig, sslFor } from "./db-config.ts";
import { createOuterMiddleware } from "./outer.ts";

const env = { CF_ACCESS_TEAM_DOMAIN: "growgen", CF_ACCESS_AUD: "aud-123" };

async function signer() {
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
	const getKey = createLocalJWKSet({ keys: [jwk] });
	const sign = (claims: { iss?: string; aud?: string; exp?: string | null } = {}) => {
		const jwt = new SignJWT({ email: "me@example.test" })
			.setProtectedHeader({ alg: "RS256", kid: "k1" })
			.setIssuer(claims.iss ?? "https://growgen.cloudflareaccess.com")
			.setAudience(claims.aud ?? "aud-123");
		if (claims.exp !== null) jwt.setExpirationTime(claims.exp ?? "5m");
		return jwt.sign(privateKey);
	};
	return { getKey, sign };
}

describe("Cloudflare Access", () => {
	it("derives the team origin (only *.cloudflareaccess.com) and loopback hosts", () => {
		expect(teamOrigin("growgen")).toBe("https://growgen.cloudflareaccess.com");
		expect(teamOrigin("https://growgen.cloudflareaccess.com/")).toBe("https://growgen.cloudflareaccess.com");
		expect(teamOrigin("evil.example.com")).toBeNull();
		expect(teamOrigin("growgen.cloudflareaccess.com.evil.test")).toBeNull();
		expect(teamOrigin("bad host!")).toBeNull();
		expect(teamOrigin(undefined)).toBeNull();
		expect(["127.0.0.1", "localhost", "::1"].every(isLoopbackHost)).toBe(true);
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
		expect(isLoopbackHost(undefined)).toBe(false);
	});

	it("chooses the mode: off, enforce, or fail-closed misconfigured", () => {
		expect(accessMode({ SITE_ENV: "local", HOST: "0.0.0.0" })).toBe("off");
		expect(accessMode({ SITE_ENV: "production", HOST: "127.0.0.1" })).toBe("off");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0" })).toBe("misconfigured");
		expect(accessMode({ SITE_ENV: "production" })).toBe("misconfigured"); // unset HOST is not loopback
		expect(accessMode({ SITE_ENV: "local", HOST: "0.0.0.0", ADMIN_REQUIRE_ACCESS: "1" })).toBe("misconfigured");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0", CF_ACCESS_AUD: "a" })).toBe("misconfigured");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0", ...env })).toBe("enforce");
		expect(accessMode({ SITE_ENV: "testing", ...env })).toBe("enforce");
	});

	it("accepts a valid token and rejects wrong audience, issuer, expiry, missing exp, garbage and missing", async () => {
		const { getKey, sign } = await signer();
		const v = (t: string | null) => verifyAccessJwt(t, env, { getKey });
		expect(await v(await sign())).toBe(true);
		expect(await v(await sign({ aud: "other" }))).toBe(false);
		expect(await v(await sign({ iss: "https://evil.cloudflareaccess.com" }))).toBe(false);
		expect(await v(await sign({ exp: "-1m" }))).toBe(false);
		expect(await v(await sign({ exp: null }))).toBe(false);
		expect(await v("not.a.jwt")).toBe(false);
		expect(await v(null)).toBe(false);
	});

	it("outer middleware: 403 without a valid JWT, passes with one, exempts only the raw /healthz path, 503 when unconfigured", async () => {
		const { getKey, sign } = await signer();
		const verifyAccess = (t: string | null | undefined, e: typeof env) => verifyAccessJwt(t, e, { getKey });
		const mk = (e: Record<string, string>) => createOuterMiddleware({ getEnv: () => e, verifyAccess: verifyAccess as never, checkStartup: false });
		const ctx = (path: string, jwt?: string) =>
			({
				url: new URL(`https://admin.growgen.xyz${path}`),
				request: new Request(`https://admin.growgen.xyz${path}`, { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} }),
			}) as never;
		const next = vi.fn(async () => new Response("ok"));
		const prod = mk({ SITE_ENV: "production", HOST: "0.0.0.0", ...env });

		for (const p of ["/_emdash/admin", "/_emdash/api/manifest", "/_emdash/api/auth/me", "/"]) {
			expect((await prod(ctx(p), next))!.status, p).toBe(403);
		}
		expect((await prod(ctx("/_emdash/admin", "garbage"), next))!.status).toBe(403);
		expect(next).not.toHaveBeenCalled();
		expect((await prod(ctx("/_emdash/admin", await sign()), next))!.status).toBe(200);
		expect((await prod(ctx("/healthz"), next))!.status).toBe(200);
		expect((await prod(ctx("/%68ealthz"), next))!.status).toBe(403);
		expect((await prod(ctx("/healthz/x"), next))!.status).toBe(403);

		const unconfigured = mk({ SITE_ENV: "production", HOST: "0.0.0.0" });
		expect((await unconfigured(ctx("/_emdash/admin", await sign()), next))!.status).toBe(503);
	});
});

describe("runtime database config", () => {
	it("fails closed without DATABASE_URL (no build-time fallback)", () => {
		expect(() => runtimeDialectConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL is not set/);
		expect(PLACEHOLDER_DATABASE_URL).toContain(".invalid");
	});

	const REF = "abcdefghij1234567890";
	const TREF = "tttttttttt1234567890";
	const poolerUrl = (qs = "") => `postgresql://postgres.${TREF}:p@aws-0-eu.pooler.supabase.com:5432/postgres${qs}`;
	const testingEnv = { SITE_ENV: "testing", SUPABASE_PRODUCTION_REF: REF, SUPABASE_TESTING_REF: TREF, HOST: "0.0.0.0" };

	it("uses TLS for the Supabase pooler and none for loopback, with a small pool", () => {
		const pooler = runtimeDialectConfig({ ...testingEnv, DATABASE_URL: poolerUrl() } as never);
		expect(pooler.ssl).toEqual({ rejectUnauthorized: false });
		expect(pooler.pool.max).toBe(POOL_MAX);
		expect(POOL_MAX).toBeLessThanOrEqual(3);
		expect(sslFor("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
		expect(sslFor("postgresql://u:p@host.docker.internal:54322/postgres")).toBe(false);
		expect(sslFor("postgresql://u:p@localhost/postgres")).toBe(false);
	});

	it("strips sslmode so it can never override our ssl object, and refuses weakening modes for remote DBs", () => {
		const cfg = runtimeDialectConfig({ ...testingEnv, DATABASE_URL: poolerUrl("?sslmode=verify-full") } as never);
		expect(cfg.connectionString).not.toMatch(/sslmode/);
		expect(connectionConfig({ ...testingEnv, DATABASE_URL: poolerUrl("?sslmode=require") } as never).connectionString).not.toMatch(/sslmode|\?/);
		for (const mode of ["disable", "no-verify", "allow", "prefer"]) {
			expect(() => runtimeDialectConfig({ ...testingEnv, DATABASE_URL: poolerUrl(`?sslmode=${mode}`) } as never), mode).toThrow(/sslmode/);
		}
		// loopback: stripped too, ssl stays off
		const local = connectionConfig({ DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable" } as never);
		expect(local.ssl).toBe(false);
		expect(local.connectionString).not.toMatch(/sslmode/);
	});

	it("runtime refuses what start.mjs refuses (no refs configured, wrong ref)", () => {
		expect(() => runtimeDialectConfig({ SITE_ENV: "testing", HOST: "0.0.0.0", DATABASE_URL: poolerUrl() } as never)).toThrow(/SUPABASE_PRODUCTION_REF/);
		expect(() => runtimeDialectConfig({ ...testingEnv, SUPABASE_TESTING_REF: "other00000123456789", DATABASE_URL: poolerUrl() } as never)).toThrow(/SUPABASE_TESTING_REF/);
	});

	it("DATABASE_CA_CERT: blank is an error, unreadable file is a clear error, literal \\n PEM is rejected, empty means unset", () => {
		const url = poolerUrl();
		expect(() => sslOptionsFor(url, { DATABASE_CA_CERT: "   " } as never)).toThrow(/blank/);
		expect(() => sslOptionsFor(url, { DATABASE_CA_CERT: "/nonexistent/ca.pem" } as never)).toThrow(/could not be read/);
		expect(() => sslOptionsFor(url, { DATABASE_CA_CERT: "-x\\nabc" } as never)).toThrow(/literal/);
		expect(sslOptionsFor(url, { DATABASE_CA_CERT: "" } as never)).toEqual({ rejectUnauthorized: false });
		expect(evaluateStartup({ ...testingEnv, DATABASE_URL: url, DATABASE_CA_CERT: "  " }).errors.join()).toMatch(/blank/);
	});

	it("outer middleware fails closed (503) on unsafe startup config and turns Access on for a mislabelled production ref", async () => {
		const next = vi.fn(async () => new Response("ok"));
		const ctx = (p: string) => ({ url: new URL(`https://a.test${p}`), request: new Request(`https://a.test${p}`) }) as never;
		const prodUrl = `postgresql://postgres.${REF}:p@aws-0-eu.pooler.supabase.com:5432/postgres`;
		const mk = (e: Record<string, string>) => createOuterMiddleware({ getEnv: () => e });
		// testing label + prod URL, refs unset: unsafe
		expect((await mk({ SITE_ENV: "testing", HOST: "0.0.0.0", DATABASE_URL: prodUrl })(ctx("/_emdash/admin"), next))!.status).toBe(503);
		// prod ref under a testing label with refs set: mismatch with TESTING_REF -> unsafe
		expect((await mk({ ...testingEnv, DATABASE_URL: prodUrl, ADMIN_CONFIRM_PRODUCTION: "yes" })(ctx("/_emdash/admin"), next))!.status).toBe(503);
		// production by ref, confirmed, but Access not configured: 503 from the Access gate
		const prodNoAccess = mk({ SITE_ENV: "production", SUPABASE_PRODUCTION_REF: REF, HOST: "0.0.0.0", ADMIN_CONFIRM_PRODUCTION: "yes", DATABASE_URL: prodUrl });
		expect((await prodNoAccess(ctx("/_emdash/admin"), next))!.status).toBe(503);
		expect((await prodNoAccess(ctx("/healthz"), next))!.status).toBe(200);
		expect(next).not.toHaveBeenCalled();
	});

	it("verifies the chain when DATABASE_CA_CERT is set", () => {
		const pem = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";
		const ssl = sslFor("postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres", { DATABASE_CA_CERT: pem } as never);
		expect(ssl).toEqual({ ca: pem, rejectUnauthorized: true });
	});
});

describe("startup safety gate (INF-5 project-ref rules)", () => {
	const REF = "abcdefghij1234567890";
	const OTHER = "zzzzzzzzzz1234567890";
	const pooler = (ref: string, qs = "") => `postgresql://postgres.${ref}:pw@aws-0-eu.pooler.supabase.com:5432/postgres${qs}`;
	const local = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
	const base = { SUPABASE_PRODUCTION_REF: REF, SUPABASE_TESTING_REF: OTHER };

	it("matches INF-5's helpers", () => {
		for (const u of [pooler(REF), local, pooler(REF, "?options=x"), "nonsense"]) {
			expect(parseProjectRef(u)).toBe(webParseProjectRef(u));
			expect(Boolean(disallowedUrlParams(u))).toBe(Boolean(webDisallowedUrlParams(u)));
		}
	});

	it("local on loopback needs nothing", () => {
		const r = evaluateStartup({ ...base, DATABASE_URL: local, SITE_ENV: "local", HOST: "127.0.0.1" });
		expect(r.errors).toEqual([]);
		expect(r.requireAccess).toBe(false);
	});

	it("a production ref needs confirmation and Access whatever SITE_ENV says", () => {
		for (const siteEnv of [undefined, "local", "production"]) {
			const r = evaluateStartup({ ...base, DATABASE_URL: pooler(REF), SITE_ENV: siteEnv, HOST: "0.0.0.0", ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL: "yes" });
			expect(r.effectiveProduction, String(siteEnv)).toBe(true);
			expect(r.errors.join(" "), String(siteEnv)).toMatch(/ADMIN_CONFIRM_PRODUCTION/);
			expect(r.requireAccess).toBe(true);
		}
		const ok = evaluateStartup({ ...base, DATABASE_URL: pooler(REF), SITE_ENV: "production", HOST: "0.0.0.0", ADMIN_CONFIRM_PRODUCTION: "yes" });
		expect(ok.errors).toEqual([]);
		expect(ok.requireAccess).toBe(true);
	});

	it("refuses mismatches, remote DB under SITE_ENV=local, bad query params and unverifiable users", () => {
		const e = (env: Record<string, string>) => evaluateStartup({ ...base, HOST: "0.0.0.0", ADMIN_CONFIRM_PRODUCTION: "yes", ...env }).errors.join(" | ");
		expect(e({ DATABASE_URL: pooler(REF), SITE_ENV: "local" })).toMatch(/remote host/);
		expect(e({ DATABASE_URL: pooler(OTHER), SITE_ENV: "production" })).toMatch(/does not match SUPABASE_PRODUCTION_REF/);
		expect(e({ DATABASE_URL: pooler(REF), SITE_ENV: "testing" })).toMatch(/targets the production project/);
		expect(e({ DATABASE_URL: local, SITE_ENV: "production" })).toMatch(/loopback/);
		expect(e({ DATABASE_URL: pooler(REF, "?user=postgres&host=evil"), SITE_ENV: "production" })).toMatch(/unsupported query/);
		expect(e({ DATABASE_URL: "postgresql://postgres:pw@aws-0-eu.pooler.supabase.com:5432/postgres", SITE_ENV: "testing" })).toMatch(/cannot verify/);
		expect(evaluateStartup({ SITE_ENV: "production", DATABASE_URL: pooler(REF), HOST: "0.0.0.0", ADMIN_CONFIRM_PRODUCTION: "yes" }).errors.join()).toMatch(/SUPABASE_PRODUCTION_REF/);
	});
});
