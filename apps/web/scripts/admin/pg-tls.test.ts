import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_SUPABASE_CA_PATH,
	SUPABASE_ROOT_CA_SHA256,
	isLocalDbHost,
	loadDatabaseCa,
	pgClientConfig,
	pgSslFor,
} from "./pg-tls.mjs";

const REMOTE = "postgresql://postgres.abcdefghij1234567890:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n";

describe("pg-tls (SEC-09)", () => {
	it("the committed CA is the Supabase Root 2021 CA with the pinned fingerprint", () => {
		const cert = new X509Certificate(readFileSync(DEFAULT_SUPABASE_CA_PATH));
		expect(cert.subject).toContain("CN=Supabase Root 2021 CA");
		expect(cert.ca).toBe(true);
		expect(cert.fingerprint256).toBe(SUPABASE_ROOT_CA_SHA256);
	});

	it("treats only exact loopback hostnames as local", () => {
		for (const h of ["localhost", "127.0.0.1", "::1", "[::1]", "LOCALHOST"]) expect(isLocalDbHost(h)).toBe(true);
		for (const h of ["db.example.com", "aws-0.pooler.supabase.com", "localhost.evil.com", "127.0.0.2"]) expect(isLocalDbHost(h)).toBe(false);
	});

	it("uses no TLS for local Supabase", () => {
		expect(pgSslFor("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(false);
		expect(pgSslFor("postgresql://postgres:postgres@localhost:54322/postgres")).toBe(false);
	});

	it("verifies remote hosts against the committed CA by default", () => {
		const ssl = pgSslFor(REMOTE, { env: {} });
		expect(ssl).not.toBe(false);
		if (ssl === false) return;
		expect(ssl.rejectUnauthorized).toBe(true);
		expect(ssl.ca).toBe(readFileSync(DEFAULT_SUPABASE_CA_PATH, "utf8"));
	});

	it("does not treat a hostname merely containing localhost/127.0.0.1 as local", () => {
		expect(pgSslFor("postgresql://u:p@localhost.attacker.example:5432/db?x=127.0.0.1", { env: {} })).toMatchObject({ rejectUnauthorized: true });
	});

	it("honours DATABASE_CA_CERT as PEM text or a file path (INF-9 semantics)", () => {
		expect(loadDatabaseCa({ env: { DATABASE_CA_CERT: PEM } })).toBe(PEM.trim());
		const ca = loadDatabaseCa({
			env: { DATABASE_CA_CERT: "/custom/ca.crt" },
			exists: (p) => p === "/custom/ca.crt",
			readFile: () => PEM,
		});
		expect(ca).toBe(PEM);
	});

	it("fails closed with a clear error instead of disabling verification", () => {
		expect(() => loadDatabaseCa({ env: { DATABASE_CA_CERT: "   " } })).toThrow(/blank/);
		expect(() => loadDatabaseCa({ env: { DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nabc" } })).toThrow(/PEM/);
		expect(() => loadDatabaseCa({ env: { DATABASE_CA_CERT: "abc\\ndef" } })).toThrow(/literal/);
		expect(() => loadDatabaseCa({ env: { DATABASE_CA_CERT: "/nope.crt" }, exists: () => false })).toThrow(/not found/);
		expect(() => loadDatabaseCa({ env: {}, exists: () => false })).toThrow(/prod-ca-2021\.crt/);
		expect(() => loadDatabaseCa({ env: {}, exists: () => true, readFile: () => "garbage" })).toThrow(/PEM/);
		expect(() => pgSslFor(REMOTE, { env: {}, exists: () => false })).toThrow(/DATABASE_CA_CERT/);
	});

	it("strips libpq ssl* params so they cannot replace the CA or disable verification", () => {
		const cfg = pgClientConfig(`${REMOTE}?sslmode=no-verify&sslrootcert=/tmp/x&application_name=probe`, { env: {} });
		expect(cfg.connectionString).not.toMatch(/ssl/i);
		expect(cfg.connectionString).toContain("application_name=probe");
		expect(cfg.ssl).toMatchObject({ rejectUnauthorized: true });
		expect(pgClientConfig("postgresql://postgres:postgres@127.0.0.1:54322/postgres").ssl).toBe(false);
	});
});
