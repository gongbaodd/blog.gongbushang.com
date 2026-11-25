// Pure startup safety rules shared by scripts/start.mjs (container/CLI entrypoint), src/db-config.ts (runtime pool) and
// src/outer.ts (request-time gate), so protection never depends on which entrypoint launched the server.
// Plain JS so the production image needs no TypeScript. The project-ref gate mirrors INF-5
// (apps/web/scripts/sync/lib.mjs: parseProjectRef, disallowedUrlParams); access.test.ts checks they stay in step.
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

/** `sslmode` values a remote database may carry; they only say "use TLS" and are stripped (our own ssl object decides). */
const REMOTE_OK_SSLMODES = new Set(["require", "verify-ca", "verify-full"]);

/** Split the URL into its connection string without `sslmode` and the `sslmode` value (lowercased) if any. */
export function splitSslMode(url) {
	try {
		const u = new URL(url);
		const mode = u.searchParams.get("sslmode")?.toLowerCase();
		for (const k of [...u.searchParams.keys()]) if (k.toLowerCase() === "sslmode") u.searchParams.delete(k);
		return { url: u.toString(), sslmode: mode };
	} catch {
		return { url, sslmode: undefined };
	}
}

/**
 * pg `ssl` option. Loopback = false. Otherwise TLS: with DATABASE_CA_CERT (PEM text or a file path) the chain and hostname are
 * verified (verify-full); without it the certificate is not verified (Supabase's pooler CA is not in the system store).
 * Throws an Error with a clear message when DATABASE_CA_CERT is whitespace-only or unreadable.
 */
export function sslOptionsFor(url, env = process.env) {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {
		return { rejectUnauthorized: false };
	}
	if (LOOPBACK_DB_HOST_RE.test(host)) return false;
	const raw = env.DATABASE_CA_CERT;
	if (raw && !raw.trim()) throw new Error("DATABASE_CA_CERT is set but blank; unset it or give a PEM / file path");
	const ca = raw?.trim();
	if (!ca) return { rejectUnauthorized: false };
	if (ca.includes("-----BEGIN")) return { ca, rejectUnauthorized: true };
	if (/\\n/.test(ca)) throw new Error("DATABASE_CA_CERT looks like a PEM with literal \\n sequences; use a file path or real newlines");
	try {
		return { ca: readFileSync(ca, "utf8"), rejectUnauthorized: true };
	} catch (e) {
		throw new Error(`DATABASE_CA_CERT file could not be read (${e?.code ?? "error"}): ${ca}`);
	}
}

/**
 * What the pg client/pool must be given: the URL WITHOUT `sslmode` (pg's parser would otherwise override our `ssl` object:
 * `disable` -> plaintext, `no-verify` -> no verification, `require`/`verify-full` -> drops the CA) plus the computed `ssl`.
 */
export function connectionConfig(env = process.env) {
	const raw = env.DATABASE_URL?.trim() ?? "";
	return { connectionString: splitSslMode(raw).url, ssl: sslOptionsFor(raw, env) };
}

/**
 * Decide whether the admin may start and what protection it needs.
 * Returns { errors: string[], siteEnv, effectiveProduction, requireAccess, host, target }.
 * An unset HOST is NOT loopback (the adapter may fall back to a build-time host); start.mjs pins it before calling this.
 */
export function evaluateStartup(env) {
	const errors = [];
	const siteEnv = env.SITE_ENV || "local";
	const url = env.DATABASE_URL?.trim();
	const host = (env.HOST ?? "").trim();
	const result = { errors, siteEnv, effectiveProduction: false, requireAccess: false, host, target: "" };

	if (siteEnv === "testing") errors.push("SITE_ENV=testing was retired by INF-10 (environments are local and production); use SITE_ENV=production for the remote database");
	else if (!["local", "production"].includes(siteEnv)) errors.push(`SITE_ENV must be local or production (got "${siteEnv}")`);
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
	const sslmode = splitSslMode(url).sslmode;
	if (!loopbackDb && sslmode && !REMOTE_OK_SSLMODES.has(sslmode)) {
		errors.push(`DATABASE_URL sslmode=${sslmode} would weaken TLS to a remote database; use require, verify-ca or verify-full (or omit it)`);
	}
	if (!loopbackDb) {
		try {
			sslOptionsFor(url, env);
		} catch (e) {
			errors.push(e.message);
		}
	}

	const ref = parseProjectRef(url);
	const prodRef = env.SUPABASE_PRODUCTION_REF?.trim().toLowerCase() || undefined;
	const refIsProduction = Boolean(ref && prodRef && ref === prodRef);

	if (siteEnv !== "local" && loopbackDb) errors.push(`SITE_ENV=${siteEnv} but DATABASE_URL points at a loopback/local host (${u.hostname})`);
	if (siteEnv === "local" && !loopbackDb && env.ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL !== "yes") {
		errors.push(
			`SITE_ENV=local but DATABASE_URL points at a remote host (${u.hostname}). Set SITE_ENV to the real environment, or ADMIN_ALLOW_REMOTE_DB_WITH_LOCAL=yes to override`,
		);
	}
	if (!loopbackDb) {
		// Fail closed like INF-5: there is exactly one remote project (production), so ANY remote database must match
		// SUPABASE_PRODUCTION_REF, whatever SITE_ENV says (INF-10).
		if (!ref) errors.push('DATABASE_URL user is not "postgres.<project-ref>"; cannot verify which Supabase project it targets');
		if (!prodRef) errors.push("a remote database requires SUPABASE_PRODUCTION_REF (the only remote project is production)");
		if (prodRef && ref && ref !== prodRef) errors.push("DATABASE_URL project ref does not match SUPABASE_PRODUCTION_REF");
	}

	// A remote database (production by ref) always counts as production, whatever SITE_ENV says.
	result.effectiveProduction = siteEnv === "production" || refIsProduction;
	if (result.effectiveProduction) {
		if (env.ADMIN_CONFIRM_PRODUCTION !== "yes") {
			errors.push("this edits the LIVE production database. Set ADMIN_CONFIRM_PRODUCTION=yes to confirm");
		}
		result.requireAccess = !isLoopbackListenHost(host);
	}
	return result;
}
