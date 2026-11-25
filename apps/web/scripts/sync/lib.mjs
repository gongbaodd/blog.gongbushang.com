// Pure ESM helpers for INF-5 environment content sync (D4, D11).
// No side effects and zero external dependencies so everything is cleanly unit-testable.
import { parseEnv } from "node:util";

export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const DERIVED_SCHEMA = "derived";

/**
 * Target environment definitions.
 * Variable names match apps/web/scripts/admin/lib.mjs so repo-root `.env` is the single source of truth.
 */
export const ENVS = Object.freeze({
	local: Object.freeze({
		name: "local",
		urlVar: "SUPABASE_LOCAL_DB_URL",
		defaultUrl: LOCAL_DB_URL,
		isRemote: false,
		requiresProductionFlag: false,
	}),
	testing: Object.freeze({
		name: "testing",
		urlVar: "SUPABASE_TESTING_POOLER_URL",
		defaultUrl: undefined,
		isRemote: true,
		requiresProductionFlag: false,
	}),
	production: Object.freeze({
		name: "production",
		urlVar: "SUPABASE_PRODUCTION_POOLER_URL",
		defaultUrl: undefined,
		isRemote: true,
		requiresProductionFlag: true,
	}),
});

/**
 * Exact auth / user / passkey / session / OAuth / token tables from EmDash 1.6.0 Postgres migrations
 * (`node_modules/emdash/src/database/migrations/001..098` & `src/transfer/format/columns.ts`).
 *
 * Passkeys (`credentials`), sessions/tokens (`auth_tokens`), and OAuth credentials are domain- and
 * environment-bound (D4, D11) and must NEVER be copied across environments.
 */
export const EXCLUDED_AUTH_TABLES = Object.freeze([
	"users", // 001_initial, 008_auth, 098_user_last_login
	"credentials", // 008_auth, 037_credential_algorithm (WebAuthn passkeys)
	"auth_tokens", // 008_auth (sessions, magic/verification/invite tokens)
	"auth_challenges", // 008_auth (WebAuthn passkey challenges)
	"oauth_accounts", // 008_auth (external OAuth account links)
	"allowed_domains", // 008_auth (auth allowed email domains)
	"_emdash_api_tokens", // 016_api_tokens
	"_emdash_oauth_tokens", // 016_api_tokens
	"_emdash_oauth_clients", // 025_oauth_clients
	"_emdash_authorization_codes", // 017_authorization_codes
	"_emdash_device_codes", // 016_api_tokens
]);

/**
 * Environment-bound security, setup, encrypted plugin storage, audit, and schema-migration tables.
 *
 * - `options` holds `setup_completed`, `site:domain`, `emdash:passkey_pending:*`, and `plugin:*`
 *   settings encrypted with each environment's own `EMDASH_ENCRYPTION_KEY`.
 * - `_plugin_*` holds plugin secrets/state encrypted with the source env's `EMDASH_ENCRYPTION_KEY`.
 * - `_emdash_migrations*` belongs to the target database's own schema migration ledger.
 */
export const EXCLUDED_ENV_STATE_TABLES = Object.freeze([
	"audit_logs", // 001_initial (references env-local users)
	"options", // 001_initial (setup state, domain, passkey pending, encrypted plugin KV)
	"_emdash_migrations", // database/migrations/runner.ts
	"_emdash_migrations_lock", // database/migration-lock.ts
	"_plugin_storage", // 004_plugins
	"_plugin_state", // 004_plugins
	"_plugin_indexes", // 004_plugins
]);

/**
 * Ephemeral runtime / lock / queue / log / site-transfer staging tables (env-local operational state, not content).
 */
export const EXCLUDED_RUNTIME_TABLES = Object.freeze([
	"_emdash_rate_limits", // 032_rate_limits
	"_emdash_entry_locks", // 075_entry_edit_locks
	"_emdash_rooms", // 097_room_storage
	"_emdash_room_updates", // 097_room_storage
	"_emdash_cron_tasks", // 026_cron_tasks
	"_emdash_redirect_write_lock", // 081_redirect_write_guards
	"_emdash_404_log", // 029_redirects (also used by scripts/admin/start.mjs DB probe)
	"_emdash_revision_prune_queue", // 059_revision_prune_queue
	"_emdash_media_upload_attempts", // 054_media_upload_attempts
	"_emdash_transfer_operations", // 084_site_transfer
	"_emdash_transfer_identity_map", // 084_site_transfer
	"_emdash_transfer_staged_files", // 084_site_transfer
	"_emdash_transfer_package_index", // 084_site_transfer
	"_emdash_transfer_media_blobs", // 084_site_transfer
	"_emdash_transfer_approvals", // 084_site_transfer
]);

/** Complete ordered list of `public.*` tables excluded from content sync. */
export const EXCLUDED_TABLES = Object.freeze([
	...EXCLUDED_AUTH_TABLES,
	...EXCLUDED_ENV_STATE_TABLES,
	...EXCLUDED_RUNTIME_TABLES,
]);

const EXCLUDED_TABLE_SET = new Set(EXCLUDED_TABLES);

/** Build-time derived cache tables in schema `derived` (supabase/migrations/20261125000000_derived_schema.sql). */
export const DERIVED_TABLES = Object.freeze([
	"post_embeddings",
	"cover_colors",
	"geocodes",
	"post_hints",
	"umap_state",
]);

const SAFE_IDENT_RE = /^[a-z_][a-z0-9_]*$/;

export function validateIdentifier(name, kind = "identifier") {
	if (typeof name !== "string" || !SAFE_IDENT_RE.test(name)) {
		throw new Error(`Invalid SQL ${kind}: "${String(name)}"`);
	}
	return name;
}

/** Check whether a table name (bare `users` or schema-qualified `public.users`) is excluded from sync. */
export function isExcludedTable(tableName) {
	if (typeof tableName !== "string") return false;
	const bare = tableName.startsWith("public.") ? tableName.slice("public.".length) : tableName;
	return EXCLUDED_TABLE_SET.has(bare);
}

export function parseEnvText(text) {
	return text ? parseEnv(text) : {};
}

export function looksLikePostgresUrl(url) {
	return /^postgres(ql)?:\/\/[^\s]+$/.test(url ?? "");
}

/** Host + port + database name only (never credentials), for safe logging. */
export function dbHost(url) {
	try {
		const u = new URL(url);
		return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
	} catch {
		return "<unparseable url>";
	}
}

/** Mask the password in a postgres:// URL while keeping protocol, username, host, port, and path readable. */
export function maskPostgresUrl(url) {
	try {
		const u = new URL(url);
		if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
			return "postgres://<redacted>";
		}
		const userPart = u.username ? `${u.username}:${u.password ? "<redacted>" : ""}@` : "";
		return `${u.protocol}//${userPart}${u.host}${u.pathname}${u.search}`;
	} catch {
		return "postgres://<redacted>";
	}
}

/** Mask passwords in every postgres URL and replace any explicit secret values (>= 8 chars) in arbitrary text. */
export function redactText(text, secrets = []) {
	let out = String(text).replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/g, (match) => maskPostgresUrl(match));
	for (const s of secrets) {
		if (typeof s === "string" && s.length >= 8) {
			out = out.split(s).join("<redacted>");
		}
	}
	return out;
}

/** Return a copy of a command argument array with credentials and secrets redacted. */
export function redactArgs(args, secrets = []) {
	return args.map((arg) => redactText(arg, secrets));
}

const GENERIC_NON_SECRET_WORDS = new Set(["postgres", "postgresql", "password", "localhost"]);

/** Extract the password (if any) from a postgres URL so it can also be passed into `secrets` for redaction. */
export function extractUrlPassword(url) {
	try {
		const u = new URL(url);
		const raw = u.password;
		if (!raw || GENERIC_NON_SECRET_WORDS.has(raw.toLowerCase())) return [];
		const decoded = decodeURIComponent(raw);
		const out = [];
		if (!GENERIC_NON_SECRET_WORDS.has(raw.toLowerCase())) out.push(raw);
		if (decoded !== raw && !GENERIC_NON_SECRET_WORDS.has(decoded.toLowerCase())) out.push(decoded);
		return out;
	} catch {
		return [];
	}
}

/**
 * Resolve the Postgres connection URL for an environment.
 * Precedence: `processEnv[urlVar]` -> `dotEnv[urlVar]` -> `cfg.defaultUrl` (local only).
 */
export function resolveEnvUrl(envName, dotEnv = {}, processEnv = {}) {
	const cfg = ENVS[envName];
	if (!cfg) {
		return {
			ok: false,
			missing: [],
			error: `unknown env "${envName}" (expected local, testing or production)`,
		};
	}
	const url = processEnv[cfg.urlVar] || dotEnv[cfg.urlVar] || cfg.defaultUrl;
	if (!url) {
		return { ok: false, missing: [cfg.urlVar] };
	}
	if (!looksLikePostgresUrl(url)) {
		return { ok: false, missing: [], error: `${cfg.urlVar} is not a valid postgres:// URL` };
	}
	return { ok: true, env: envName, url, varName: cfg.urlVar };
}

const DIRECT_SUPABASE_HOST_RE = /^db\.[a-z0-9-]+\.supabase\.co$/i;
const POOLER_SUPABASE_HOST_RE = /\.pooler\.supabase\.com$/i;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Verify that remote Supabase environments use the IPv4 session pooler (`*.pooler.supabase.com:5432`),
 * never the IPv6-only direct host (`db.<ref>.supabase.co`) or transaction pooler (`:6543`).
 */
export function validatePoolerUrl(envName, url) {
	const cfg = ENVS[envName];
	if (!cfg) {
		return { ok: false, error: `unknown env "${envName}"` };
	}
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, error: `${envName} URL could not be parsed` };
	}
	const host = parsed.hostname;
	const port = parsed.port || "5432";
	const warnings = [];

	if (!cfg.isRemote) {
		if (!LOCAL_HOSTS.has(host)) {
			warnings.push(`local env points to non-loopback host ${host}:${port}; verify this is intentional`);
		}
		return { ok: true, host, port, warnings };
	}

	if (DIRECT_SUPABASE_HOST_RE.test(host)) {
		return {
			ok: false,
			error:
				`${envName} uses direct host ${host}, which is IPv6-only on Supabase Free. ` +
				`Use the IPv4 session pooler (*.pooler.supabase.com:5432) in ${cfg.urlVar}.`,
		};
	}

	if (POOLER_SUPABASE_HOST_RE.test(host) && port === "6543") {
		return {
			ok: false,
			error:
				`${envName} uses transaction pooler port 6543 on ${host}. ` +
				`pg_dump and psql require the session pooler on port 5432.`,
		};
	}

	if (!POOLER_SUPABASE_HOST_RE.test(host) && !LOCAL_HOSTS.has(host)) {
		warnings.push(
			`${envName} host ${host}:${port} is not a *.pooler.supabase.com session pooler — confirm it is IPv4-reachable`,
		);
	}

	return { ok: true, host, port, warnings };
}

/** Normalize a postgres URL (protocol + host + port + pathname) to detect accidental self-sync. */
function canonicalDbEndpoint(url) {
	try {
		const u = new URL(url);
		return `${u.hostname.toLowerCase()}:${u.port || "5432"}${u.pathname}`;
	} catch {
		return url;
	}
}

/**
 * Run all safety checks before dumping or restoring.
 */
export function validateSyncPlan({ source, target, yesProduction = false, sourceUrl, targetUrl }) {
	if (!ENVS[source]) {
		return { ok: false, error: `unknown source env "${source}" (expected local, testing or production)` };
	}
	if (!ENVS[target]) {
		return { ok: false, error: `unknown target env "${target}" (expected local, testing or production)` };
	}
	if (source === target) {
		return {
			ok: false,
			error: `source and target environments are identical ("${source}"); refusing to overwrite an environment with itself`,
		};
	}
	if (ENVS[target].requiresProductionFlag && !yesProduction) {
		return {
			ok: false,
			error:
				`targeting "${target}" overwrites LIVE production content.\n` +
				`Re-run with --yes-production if you really intend to restore into production.`,
		};
	}

	const srcCheck = validatePoolerUrl(source, sourceUrl);
	if (!srcCheck.ok) return { ok: false, error: srcCheck.error };

	const dstCheck = validatePoolerUrl(target, targetUrl);
	if (!dstCheck.ok) return { ok: false, error: dstCheck.error };

	if (canonicalDbEndpoint(sourceUrl) === canonicalDbEndpoint(targetUrl)) {
		return {
			ok: false,
			error: `source (${source}) and target (${target}) resolve to the same database endpoint (${dbHost(sourceUrl)}); refusing self-sync`,
		};
	}

	return { ok: true, warnings: [...srcCheck.warnings, ...dstCheck.warnings] };
}

/**
 * Build exact `pg_dump` argument array (no shell interpolation).
 * Dumps data-only from `public` (and optionally `derived`), excluding every auth/session/passkey/env-state table.
 */
export function buildPgDumpArgs({
	sourceUrl,
	excludedTables = EXCLUDED_TABLES,
	includeDerived = false,
	outputFile,
}) {
	const args = [
		"--data-only",
		"--no-owner",
		"--no-privileges",
		"--column-inserts",
		"--schema=public",
	];
	if (includeDerived) {
		args.push(`--schema=${DERIVED_SCHEMA}`);
	}
	for (const table of excludedTables) {
		validateIdentifier(table, "excluded table");
		args.push(`--exclude-table=public.${table}`);
	}
	if (outputFile) {
		args.push("--file", outputFile);
	}
	args.push(sourceUrl);
	return args;
}

/**
 * Build exact `supabase db dump` argument array (Supabase CLI v3+, no shell interpolation).
 * Useful when `pg_dump` is not installed locally (Supabase CLI runs pg_dump in Docker).
 */
export function buildSupabaseDumpArgs({
	source,
	sourceUrl,
	excludedTables = EXCLUDED_TABLES,
	includeDerived = false,
	outputFile,
}) {
	const schemas = includeDerived ? `public,${DERIVED_SCHEMA}` : "public";
	const excludeList = excludedTables.map((table) => {
		validateIdentifier(table, "excluded table");
		return `public.${table}`;
	});
	const args = ["db", "dump", "--data-only", "--schema", schemas];
	if (excludeList.length > 0) {
		args.push("--exclude", excludeList.join(","));
	}
	if (source !== "local" || sourceUrl !== LOCAL_DB_URL) {
		args.push(`--remote=${sourceUrl}`);
	}
	if (outputFile) {
		args.push("--file", outputFile);
	}
	return args;
}

/**
 * Build a dynamic, FK-safe SQL block that truncates ONLY synced tables in `public`
 * (and `derived` if `includeDerived` is true) without ever touching excluded auth/env tables.
 *
 * Deliberately omits `CASCADE` on `TRUNCATE TABLE` so Postgres would abort the transaction
 * rather than ever cascading into an excluded table.
 */
export function buildTruncateSql({ excludedTables = EXCLUDED_TABLES, includeDerived = false } = {}) {
	const quotedExcluded = excludedTables.map((table) => {
		validateIdentifier(table, "excluded table");
		return `'${table}'`;
	});
	const publicPredicate =
		quotedExcluded.length > 0
			? `(schemaname = 'public' AND tablename NOT IN (${quotedExcluded.join(", ")}))`
			: `(schemaname = 'public')`;
	const whereClause = includeDerived
		? `${publicPredicate}\n     OR (schemaname = '${DERIVED_SCHEMA}')`
		: publicPredicate;

	return [
		"DO $$",
		"DECLARE",
		"  tbl_list text;",
		"BEGIN",
		"  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)",
		"  INTO tbl_list",
		"  FROM pg_tables",
		`  WHERE ${whereClause};`,
		"  IF tbl_list IS NOT NULL THEN",
		"    EXECUTE 'TRUNCATE TABLE ' || tbl_list || ' RESTART IDENTITY';",
		"  END IF;",
		"END $$;",
	].join("\n");
}

/**
 * Wrap a `--data-only` SQL dump with `session_replication_role = 'replica'` and atomic truncation
 * of synced content tables. Intended to be executed by `psql --single-transaction --set ON_ERROR_STOP=1`.
 */
export function buildRestoreSql({ dumpSql, excludedTables = EXCLUDED_TABLES, includeDerived = false }) {
	const cleanedDump = String(dumpSql)
		.replace(/^\s*SET\s+session_replication_role\s*=\s*['"]?(?:replica|origin)['"]?\s*;\s*$/gim, "")
		.replace(/^\s*RESET\s+ALL\s*;\s*$/gim, "")
		.trim();

	return [
		"-- Generated by apps/web/scripts/sync/pull.mjs (INF-5)",
		"SET session_replication_role = 'replica';",
		"",
		buildTruncateSql({ excludedTables, includeDerived }),
		"",
		cleanedDump,
		"",
		"SET session_replication_role = 'origin';",
		"",
	].join("\n");
}

/**
 * Build exact `psql` argument array for transactional restore (no shell interpolation).
 */
export function buildPsqlRestoreArgs({ targetUrl, sqlFile }) {
	return [
		"--single-transaction",
		"--set",
		"ON_ERROR_STOP=1",
		"--no-psqlrc",
		"--file",
		sqlFile,
		targetUrl,
	];
}

const VALID_TOOLS = new Set(["auto", "pg_dump", "supabase"]);

/**
 * Parse CLI arguments for `apps/web/scripts/sync/pull.mjs`.
 * Usage:
 *   pull.mjs <source> [--to <target>] [--dry-run] [--include-derived] [--yes-production] [--dump-file <path>] [--tool <auto|pg_dump|supabase>]
 */
export function parseCliArgs(argv) {
	const opts = {
		source: undefined,
		target: "local",
		dryRun: false,
		includeDerived: false,
		yesProduction: false,
		dumpFile: undefined,
		tool: "auto",
		help: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			opts.help = true;
			continue;
		}
		if (arg === "--dry-run") {
			opts.dryRun = true;
			continue;
		}
		if (arg === "--include-derived") {
			opts.includeDerived = true;
			continue;
		}
		if (arg === "--yes-production") {
			opts.yesProduction = true;
			continue;
		}
		if (arg === "--to") {
			const val = argv[++i];
			if (!val || val.startsWith("-")) {
				return { ok: false, error: "--to requires an environment name (local, testing or production)" };
			}
			opts.target = val;
			continue;
		}
		if (arg.startsWith("--to=")) {
			const val = arg.slice("--to=".length);
			if (!val) return { ok: false, error: "--to requires an environment name" };
			opts.target = val;
			continue;
		}
		if (arg === "--dump-file") {
			const val = argv[++i];
			if (!val || val.startsWith("-")) {
				return { ok: false, error: "--dump-file requires a file path" };
			}
			opts.dumpFile = val;
			continue;
		}
		if (arg.startsWith("--dump-file=")) {
			const val = arg.slice("--dump-file=".length);
			if (!val) return { ok: false, error: "--dump-file requires a file path" };
			opts.dumpFile = val;
			continue;
		}
		if (arg === "--tool") {
			const val = argv[++i];
			if (!val || !VALID_TOOLS.has(val)) {
				return { ok: false, error: `--tool must be one of: auto, pg_dump, supabase` };
			}
			opts.tool = val;
			continue;
		}
		if (arg.startsWith("--tool=")) {
			const val = arg.slice("--tool=".length);
			if (!VALID_TOOLS.has(val)) {
				return { ok: false, error: `--tool must be one of: auto, pg_dump, supabase` };
			}
			opts.tool = val;
			continue;
		}
		if (arg.startsWith("-")) {
			return { ok: false, error: `unknown option "${arg}"` };
		}
		if (!opts.source) {
			opts.source = arg;
		} else {
			return { ok: false, error: `unexpected extra argument "${arg}"` };
		}
	}

	if (!opts.help && !opts.source) {
		return { ok: false, error: "missing <source> environment (expected local, testing or production)" };
	}

	return { ok: true, opts };
}
