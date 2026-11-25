import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it, vi } from "vitest";
import { accessMode, isLoopbackHost, teamOrigin, verifyAccessJwt } from "./access.ts";
import { PLACEHOLDER_DATABASE_URL, POOL_MAX, runtimeDialectConfig, sslFor } from "./db-config.ts";
import { createAdminMiddleware } from "./middleware.ts";

const env = { CF_ACCESS_TEAM_DOMAIN: "growgen", CF_ACCESS_AUD: "aud-123" };

async function signer() {
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
	const getKey = createLocalJWKSet({ keys: [jwk] });
	const sign = (claims: { iss?: string; aud?: string; exp?: string } = {}) =>
		new SignJWT({ email: "me@example.test" })
			.setProtectedHeader({ alg: "RS256", kid: "k1" })
			.setIssuer(claims.iss ?? "https://growgen.cloudflareaccess.com")
			.setAudience(claims.aud ?? "aud-123")
			.setExpirationTime(claims.exp ?? "5m")
			.sign(privateKey);
	return { getKey, sign };
}

describe("Cloudflare Access", () => {
	it("derives the team origin and loopback hosts", () => {
		expect(teamOrigin("growgen")).toBe("https://growgen.cloudflareaccess.com");
		expect(teamOrigin("https://growgen.cloudflareaccess.com/")).toBe("https://growgen.cloudflareaccess.com");
		expect(teamOrigin("bad host!")).toBeNull();
		expect(teamOrigin(undefined)).toBeNull();
		expect(["127.0.0.1", "localhost", "::1", undefined].every(isLoopbackHost)).toBe(true);
		expect(isLoopbackHost("0.0.0.0")).toBe(false);
	});

	it("chooses the mode: off, enforce, or fail-closed misconfigured", () => {
		expect(accessMode({ SITE_ENV: "local", HOST: "0.0.0.0" })).toBe("off");
		expect(accessMode({ SITE_ENV: "production", HOST: "127.0.0.1" })).toBe("off");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0" })).toBe("misconfigured");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0", CF_ACCESS_AUD: "a" })).toBe("misconfigured");
		expect(accessMode({ SITE_ENV: "production", HOST: "0.0.0.0", ...env })).toBe("enforce");
		expect(accessMode({ SITE_ENV: "testing", ...env })).toBe("enforce");
	});

	it("accepts a valid token and rejects wrong audience, issuer, expiry, garbage and missing", async () => {
		const { getKey, sign } = await signer();
		const v = (t: string | null) => verifyAccessJwt(t, env, { getKey });
		expect(await v(await sign())).toBe(true);
		expect(await v(await sign({ aud: "other" }))).toBe(false);
		expect(await v(await sign({ iss: "https://evil.cloudflareaccess.com" }))).toBe(false);
		expect(await v(await sign({ exp: "-1m" }))).toBe(false);
		expect(await v("not.a.jwt")).toBe(false);
		expect(await v(null)).toBe(false);
	});

	it("middleware: 403 without a valid JWT, passes with one, exempts /healthz, 503 when required but unconfigured", async () => {
		const { getKey, sign } = await signer();
		const verifyAccess = (t: string | null | undefined, e: typeof env) => verifyAccessJwt(t, e, { getKey });
		const mk = (e: Record<string, string>) =>
			createAdminMiddleware({ getEnv: () => e, isDev: false, verifyAccess: verifyAccess as never });
		const ctx = (path: string, jwt?: string) =>
			({
				url: new URL(`https://admin.growgen.xyz${path}`),
				request: new Request(`https://admin.growgen.xyz${path}`, { headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} }),
				cookies: { get: () => undefined, set: () => undefined },
				redirect: (l: string) => new Response(null, { status: 302, headers: { Location: l } }),
			}) as never;
		const next = vi.fn(async () => new Response("ok"));
		const prod = mk({ SITE_ENV: "production", HOST: "0.0.0.0", ...env });

		expect((await prod(ctx("/_emdash/admin"), next))!.status).toBe(403);
		expect((await prod(ctx("/_emdash/admin", "garbage"), next))!.status).toBe(403);
		expect((await prod(ctx("/_emdash/admin", await sign()), next))!.status).toBe(200);
		expect((await prod(ctx("/healthz"), next))!.status).toBe(200);

		const unconfigured = mk({ SITE_ENV: "production", HOST: "0.0.0.0" });
		expect((await unconfigured(ctx("/_emdash/admin", await sign()), next))!.status).toBe(503);
	});
});

describe("runtime database config", () => {
	it("fails closed without DATABASE_URL (no build-time fallback)", () => {
		expect(() => runtimeDialectConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL is not set/);
		expect(PLACEHOLDER_DATABASE_URL).toContain(".invalid");
	});

	it("uses TLS for the Supabase pooler and none for loopback, with a small pool", () => {
		const pooler = runtimeDialectConfig({ DATABASE_URL: "postgresql://u:p@aws-0-eu.pooler.supabase.com:5432/postgres" } as never);
		expect(pooler.ssl).toEqual({ rejectUnauthorized: false });
		expect(pooler.pool.max).toBe(POOL_MAX);
		expect(POOL_MAX).toBeLessThanOrEqual(3);
		expect(sslFor("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
		expect(sslFor("postgresql://u:p@host.docker.internal:54322/postgres")).toBe(false);
		expect(sslFor("postgresql://u:p@localhost/postgres")).toBe(false);
	});
});
