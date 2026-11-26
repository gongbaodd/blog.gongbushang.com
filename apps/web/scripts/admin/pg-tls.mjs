// TLS for node-postgres connections made by repo scripts (SEC-09): derive, gen-types and the admin launcher probe.
//
// Loopback hosts (local Supabase from `supabase start`) connect without TLS. Every other host is verified with
// `rejectUnauthorized: true` against a CA, never with verification switched off:
//   1. DATABASE_CA_CERT, same semantics as apps/admin (INF-9, apps/admin/scripts/safety.mjs): PEM text or a file path;
//   2. otherwise the committed public CA `apps/web/scripts/certs/prod-ca-2021.crt` ("Supabase Root 2021 CA").
//
// Provenance of the committed CA (GON-198): byte-identical to Supabase's published
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt (the file the Dashboard's
// Database -> SSL Configuration "Download certificate" serves), subject CN=Supabase Root 2021 CA, valid until 2031-04-26,
// SHA-256 fingerprint 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA,
// and the production session pooler's chain (*.pooler.supabase.com <- Supabase Intermediate 2021 CA <- this root) verifies
// against it with hostname checking (`openssl s_client -starttls postgres -verify_hostname ...`). pg-tls.test.ts pins it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SUPABASE_CA_PATH = resolve(here, "../certs/prod-ca-2021.crt");
export const SUPABASE_ROOT_CA_SHA256 =
	"80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PEM_RE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/;

/** True only for the exact loopback hostnames (parsed hostname, not a substring of the URL). */
export function isLocalDbHost(hostname) {
	return LOOPBACK.has(String(hostname).toLowerCase());
}

/**
 * CA bundle for remote Postgres: DATABASE_CA_CERT (PEM text or file path), else the committed Supabase root CA.
 * Throws a clear error for a blank value, a PEM with literal `\n` sequences, an unreadable file or non-PEM content.
 */
export function loadDatabaseCa({ env = process.env, defaultPath = DEFAULT_SUPABASE_CA_PATH, readFile = readFileSync, exists = existsSync } = {}) {
	const raw = env.DATABASE_CA_CERT;
	if (raw !== undefined && raw !== "" && !raw.trim()) throw new Error("DATABASE_CA_CERT is set but blank; unset it or give a PEM / file path");
	const value = raw?.trim();
	if (value) {
		if (value.includes("-----BEGIN")) {
			if (!PEM_RE.test(value)) throw new Error("DATABASE_CA_CERT does not contain a complete PEM certificate");
			return value;
		}
		if (/\\n/.test(value)) throw new Error("DATABASE_CA_CERT looks like a PEM with literal \\n sequences; use a file path or real newlines");
		return readPem(value, readFile, exists, "DATABASE_CA_CERT file");
	}
	return readPem(defaultPath, readFile, exists, "Supabase root CA");
}

function readPem(path, readFile, exists, label) {
	if (!exists(path)) {
		throw new Error(
			`${label} not found at ${path}. Restore apps/web/scripts/certs/prod-ca-2021.crt from git, or set DATABASE_CA_CERT ` +
				"(PEM text or file path; Supabase Dashboard -> Database -> SSL Configuration -> Download certificate).",
		);
	}
	const pem = String(readFile(path, "utf8"));
	if (!PEM_RE.test(pem)) throw new Error(`${label} at ${path} does not contain a PEM certificate`);
	return pem;
}

/** `ssl` option for node-postgres: false for loopback, otherwise CA-verified TLS. Never `rejectUnauthorized: false`. */
export function pgSslFor(url, opts = {}) {
	if (isLocalDbHost(new URL(url).hostname)) return false;
	return { ca: loadDatabaseCa(opts), rejectUnauthorized: true };
}

/**
 * `{ connectionString, ssl }` for `new pg.Client(...)`. libpq `ssl*` query parameters are removed from the URL because
 * node-postgres lets `sslmode=` / `sslrootcert=` in the connection string replace the `ssl` object (dropping the CA, or with
 * `sslmode=no-verify`, verification itself).
 */
export function pgClientConfig(url, opts = {}) {
	const u = new URL(url);
	for (const key of [...u.searchParams.keys()]) if (/^ssl/i.test(key)) u.searchParams.delete(key);
	return { connectionString: u.toString(), ssl: pgSslFor(url, opts) };
}
