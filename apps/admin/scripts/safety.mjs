// Pure startup safety rules shared by scripts/start.mjs (container/CLI entrypoint) and src/db-config.ts (runtime pool).
// Plain JS so the production image needs no TypeScript. The project-ref gate mirrors INF-5
// (apps/web/scripts/sync/lib.mjs: parseProjectRef, disallowedUrlParams); safety.test.ts checks they stay in step.
import { readFileSync } from "node:fs";

export const LOOPBACK_DB_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?|host\.docker\.internal)$/i;

/** Hostnames that count as "this machine only" for a LISTEN address (host.docker.internal is not one). */
export function isLoopbackListenHost(host) {
	const h = String(host ?? "").trim().toLowerCase();
	return h === "localhost" || h === "::1" || h === "[::1]" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Supabase project ref from a pooler URL username (`postgres.<ref>`); undefined for anything else. */
export function parseProjectRef(url) {
	try {
		const user = decodeURIComponent(new URL(url).username);
		const m = /^postgres\.([a-z0-9]{10,40})$/i.exec(user);
		return m ? m[1].toLowerCase() : undefined;
	} catch {
		return undefined;
	}
}

/** libpq lets URL query params override the user/host the checks inspected; only `sslmode` is allowed. */
export function disallowedUrlParams(url) {
	try {
		const bad = [...new Set([...new URL(url).searchParams.keys()])].filter((k) => k.toLowerCase() !== "sslmode");
		if (bad.length > 0) return `DATABASE_URL has unsupported query parameter(s) ${bad.map((k) => `"${k}"`).join(", ")}; only ?sslmode= is allowed`;
	} catch {
		// unparseable URLs are rejected by the caller
	}
	return undefined;
}

/**
 * pg `ssl` option. Loopback = none. Otherwise TLS: with DATABASE_CA_CERT (PEM text or a file path) the chain and hostname are
 * verified (verify-full); without it the certificate is not verified (Supabase's pooler CA is not in the system store).
 */
export function sslOptionsFor(url, env = process.env) {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		return { rejectUnauthorized: false };
	}
	if (LOOPBACK_DB_HOST_RE.test(host)) return false;
	const ca = env.DATABASE_CA_CERT?.trim();
	if (ca) return { ca: ca.includes("-----BEGIN") ? ca : readFileSync(ca, "utf8"), rejectUnauthorized: true };
	return { rejectUnauthorized: false };
}

/**
 * Decide whether the admin may start and what protection it needs.
 * Returns { errors: string[], effectiveProduction, requireAccess, host, target }.
 */
export function evaluateStartup(env) {
	const errors = [];
	const siteEnv = env.SITE_ENV || "local";
	const url = env.DATABASE_URL?.trim();
	const host = (env.HOST ?? "127.0.0.1").trim();
	const result = { errors, siteEnv, effectiveProduction: false, requireAccess: false, host, target: "" };

	if (!["local", "testing", "production"].includes(siteEnv)) errors.push(`SITE_ENV must be local, testing or production (got "${siteEnv}")`);
	if (!url) {
		errors.push("DATABASE_URL is not set");
		return result;
	}
	let u;
	try {
		u = new URL(url);
	} catch {
		errors.push("DATABASE_URL is not a valid URL");
		return result;
	}
	const badParams = disallowedUrlParams(url);
	if (badParams) errors.push(badParams);
	result.target = `${u.hostname}:${u.port || "5432"}${u.pathname}`;

	const loopbackDb = LOOPBACK_DB_HOST_RE.test(u.hostname);
	const ref = parseProjectRef(url);
	const prodRef = env.SUPABASE_PRODUCTION_REF?.trim().toLowerCase() || undefined;
	const testingRef = env.SUPABASE_TESTING_REF?.trim().toLowerCase() || undefined;
	const refIsProduction = Boolean(ref && prodRef && ref === prodRef);

	if (siteEnv !== "local" && loopbackDb) errors.push(`SITE_ENV=${siteEnv} but DATABASE_URL points at a loopback/local host (${u.hostname})`);
	if (siteEnv === "local" && !loopbackDb && env.ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL !== "yes") {
		errors.push(
			`SITE_ENV=local but DATABASE_URL points at a remote host (${u.hostname}). Set SITE_ENV to the real environment, or ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL=yes to override`,
		);
	}
	if (!loopbackDb) {
		if (!ref) errors.push('DATABASE_URL user is not "postgres.<project-ref>"; cannot verify which Supabase project it targets');
		if (siteEnv === "production") {
			if (!prodRef) errors.push("SITE_ENV=production requires SUPABASE_PRODUCTION_REF to verify the target project");
			else if (ref && ref !== prodRef) errors.push("DATABASE_URL project ref does not match SUPABASE_PRODUCTION_REF");
		}
		if (siteEnv === "testing" && refIsProduction) errors.push("SITE_ENV=testing but DATABASE_URL targets the production project");
		if (siteEnv === "testing" && testingRef && ref && ref !== testingRef) errors.push("DATABASE_URL project ref does not match SUPABASE_TESTING_REF");
	}

	// A production project (by ref) always counts as production, whatever SITE_ENV claims.
	result.effectiveProduction = siteEnv === "production" || refIsProduction;
	if (result.effectiveProduction) {
		if (env.ADMIN_CONFIRM_PRODUCTION !== "yes") {
			errors.push("this edits the LIVE production database. Set ADMIN_CONFIRM_PRODUCTION=yes to confirm");
		}
		result.requireAccess = !isLoopbackListenHost(host);
	}
	return result;
}
