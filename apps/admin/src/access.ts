/**
 * Cloudflare Access JWT validation for the Node admin (D12, INF-9 review).
 *
 * Recommended exposure is a Cloudflare Tunnel (cloudflared) to a private container with no published port, behind an Access
 * application. Access then sends `Cf-Access-Jwt-Assertion` on every request. That header is only trustworthy if the origin
 * verifies it, so we verify signature (JWKS from the team domain), issuer and audience here instead of trusting its presence.
 *
 *   CF_ACCESS_TEAM_DOMAIN  `<team>` or `<team>.cloudflareaccess.com`
 *   CF_ACCESS_AUD          the Access application's AUD tag
 *
 * Enforced when CF_ACCESS_AUD is set; required (fail closed) when SITE_ENV=production and the server is not bound to loopback.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const ACCESS_HEADER = "cf-access-jwt-assertion";

export interface AccessEnv {
	CF_ACCESS_TEAM_DOMAIN?: string;
	CF_ACCESS_AUD?: string;
	SITE_ENV?: string;
	HOST?: string;
}

export type AccessMode = "off" | "enforce" | "misconfigured";

export function teamOrigin(teamDomain: string | undefined): string | null {
	const t = teamDomain?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
	if (!t || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(t)) return null;
	return `https://${t.includes(".") ? t : `${t}.cloudflareaccess.com`}`;
}

export function isLoopbackHost(host: string | undefined): boolean {
	const h = (host ?? "127.0.0.1").trim().toLowerCase();
	return h === "localhost" || h === "::1" || h === "[::1]" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** `off`: not enforced; `enforce`: verify the JWT; `misconfigured`: Access is required or half-configured, so refuse everything. */
export function accessMode(env: AccessEnv): AccessMode {
	const hasAud = Boolean(env.CF_ACCESS_AUD?.trim());
	const required = env.SITE_ENV === "production" && !isLoopbackHost(env.HOST);
	if (!hasAud && !required) return "off";
	return hasAud && teamOrigin(env.CF_ACCESS_TEAM_DOMAIN) ? "enforce" : "misconfigured";
}

const jwksCache = new Map<string, JWTVerifyGetKey>();
function jwksFor(origin: string): JWTVerifyGetKey {
	let jwks = jwksCache.get(origin);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${origin}/cdn-cgi/access/certs`), { cooldownDuration: 30_000, cacheMaxAge: 600_000 });
		jwksCache.set(origin, jwks);
	}
	return jwks;
}

export interface VerifyOptions {
	/** Test seam: a local key resolver instead of the remote JWKS. */
	getKey?: JWTVerifyGetKey;
}

/** True when the token is a valid, unexpired Access JWT for this team and application. Never throws. */
export async function verifyAccessJwt(
	token: string | null | undefined,
	env: AccessEnv,
	options: VerifyOptions = {},
): Promise<boolean> {
	const origin = teamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
	const aud = env.CF_ACCESS_AUD?.trim();
	if (!token || !origin || !aud) return false;
	try {
		await jwtVerify(token, options.getKey ?? jwksFor(origin), { issuer: origin, audience: aud, algorithms: ["RS256"] });
		return true;
	} catch {
		return false;
	}
}
