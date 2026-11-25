import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import {
	DERIVED_SCHEMA,
	EXCLUDED_AUTH_TABLES,
	EXCLUDED_ENV_STATE_TABLES,
	EXCLUDED_RUNTIME_TABLES,
	EXCLUDED_TABLES,
	LOCAL_DB_URL,
	buildPgDumpArgs,
	buildPsqlRestoreArgs,
	buildRestoreSql,
	buildSupabaseDumpArgs,
	buildTruncateSql,
	dbHost,
	extractUrlPassword,
	isExcludedTable,
	maskPostgresUrl,
	parseCliArgs,
	redactArgs,
	redactText,
	resolveEnvUrl,
	validatePoolerUrl,
	validateSyncPlan,
} from "./lib.mjs";

const TESTING_POOLER =
	"postgresql://postgres.ckpozotzgubrjbjstvjg:TestP%40ssw0rd!@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
const PROD_POOLER =
	"postgresql://postgres.epewqznhtgjirbfeqfrj:ProdSuperSecret99@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const DIRECT_IPV6_URL =
	"postgresql://postgres:DirectPass123@db.ckpozotzgubrjbjstvjg.supabase.co:5432/postgres";
const TX_POOLER_URL =
	"postgresql://postgres.ckpozotzgubrjbjstvjg:TxPass123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

describe("excluded table list (EmDash 1.6.0 schema audit)", () => {
	it("excludes every EmDash auth, user, passkey, session, OAuth, and token table", () => {
		const expectedAuthTables = [
			"users",
			"credentials",
			"auth_tokens",
			"auth_challenges",
			"oauth_accounts",
			"allowed_domains",
			"_emdash_api_tokens",
			"_emdash_oauth_tokens",
			"_emdash_oauth_clients",
			"_emdash_authorization_codes",
			"_emdash_device_codes",
		];
		for (const table of expectedAuthTables) {
			expect(EXCLUDED_AUTH_TABLES).toContain(table);
			expect(EXCLUDED_TABLES).toContain(table);
			expect(isExcludedTable(table)).toBe(true);
			expect(isExcludedTable(`public.${table}`)).toBe(true);
		}
	});

	it("excludes env-bound options/setup, audit, migration, and encrypted plugin tables", () => {
		const expectedEnvTables = [
			"audit_logs",
			"options",
			"_emdash_migrations",
			"_emdash_migrations_lock",
			"_plugin_storage",
			"_plugin_state",
			"_plugin_indexes",
		];
		for (const table of expectedEnvTables) {
			expect(EXCLUDED_ENV_STATE_TABLES).toContain(table);
			expect(isExcludedTable(table)).toBe(true);
		}
	});

	it("excludes ephemeral runtime lock, log, room, cron, and transfer tables", () => {
		const expectedRuntimeTables = [
			"_emdash_rate_limits",
			"_emdash_entry_locks",
			"_emdash_rooms",
			"_emdash_room_updates",
			"_emdash_cron_tasks",
			"_emdash_redirect_write_lock",
			"_emdash_404_log",
			"_emdash_revision_prune_queue",
			"_emdash_media_upload_attempts",
			"_emdash_transfer_operations",
			"_emdash_transfer_identity_map",
			"_emdash_transfer_staged_files",
			"_emdash_transfer_package_index",
			"_emdash_transfer_media_blobs",
			"_emdash_transfer_approvals",
		];
		for (const table of expectedRuntimeTables) {
			expect(EXCLUDED_RUNTIME_TABLES).toContain(table);
			expect(isExcludedTable(table)).toBe(true);
		}
	});

	it("keeps all content, taxonomy, media, schema, byline, revision, and site-structure tables", () => {
		const syncedContentTables = [
			"ec_posts",
			"ec_pages",
			"taxonomies",
			"content_taxonomies",
			"_emdash_taxonomy_defs",
			"_emdash_taxonomy_def_groups",
			"media",
			"media_folders",
			"_emdash_collections",
			"_emdash_fields",
			"_emdash_block_types",
			"_emdash_block_type_versions",
			"revisions",
			"_emdash_relations",
			"_emdash_content_references",
			"_emdash_bylines",
			"_emdash_content_bylines",
			"_emdash_byline_fields",
			"_emdash_byline_field_values",
			"_emdash_byline_field_group_values",
			"_emdash_seo",
			"_emdash_menus",
			"_emdash_menu_items",
			"_emdash_sections",
			"_emdash_widget_areas",
			"_emdash_widgets",
			"_emdash_redirects",
			"_emdash_comments",
			"_emdash_comment_reactions",
		];
		for (const table of syncedContentTables) {
			expect(isExcludedTable(table)).toBe(false);
			expect(isExcludedTable(`public.${table}`)).toBe(false);
		}
	});

	it("has no duplicate excluded tables and every name is a safe SQL identifier", () => {
		expect(new Set(EXCLUDED_TABLES).size).toBe(EXCLUDED_TABLES.length);
		for (const table of EXCLUDED_TABLES) {
			expect(table).toMatch(/^[a-z_][a-z0-9_]*$/);
		}
	});
});

describe("resolveEnvUrl", () => {
	it("defaults local to LOCAL_DB_URL when unset", () => {
		const res = resolveEnvUrl("local", {}, {});
		expect(res).toEqual({
			ok: true,
			env: "local",
			url: LOCAL_DB_URL,
			varName: "SUPABASE_LOCAL_DB_URL",
		});
	});

	it("prefers process.env over .env for remote URLs", () => {
		const dotEnv = { SUPABASE_TESTING_POOLER_URL: "postgresql://u:old@aws-0.pooler.supabase.com:5432/postgres" };
		const procEnv = { SUPABASE_TESTING_POOLER_URL: TESTING_POOLER };
		const res = resolveEnvUrl("testing", dotEnv, procEnv);
		expect(res).toMatchObject({ ok: true, env: "testing", url: TESTING_POOLER });
	});

	it("reports missing variable name for production when unset", () => {
		const res = resolveEnvUrl("production", {}, {});
		expect(res).toEqual({ ok: false, missing: ["SUPABASE_PRODUCTION_POOLER_URL"] });
	});

	it("rejects unknown environments and malformed URLs", () => {
		expect(resolveEnvUrl("staging", {}, {}).ok).toBe(false);
		expect(resolveEnvUrl("testing", { SUPABASE_TESTING_POOLER_URL: "https://not-postgres.example" }, {}).ok).toBe(
			false,
		);
	});
});

describe("password redaction", () => {
	it("masks passwords in postgres URLs while keeping host/port/db readable", () => {
		const masked = maskPostgresUrl(TESTING_POOLER);
		expect(masked).toBe(
			"postgresql://postgres.ckpozotzgubrjbjstvjg:<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
		);
		expect(masked).not.toContain("TestP");
		expect(masked).not.toContain("ssw0rd");
	});

	it("redacts URLs and secrets inside arbitrary log text and arg arrays", () => {
		const msg = `pg_dump failed connecting to ${PROD_POOLER} with key ProdSuperSecret99`;
		const safeMsg = redactText(msg, ["ProdSuperSecret99"]);
		expect(safeMsg).not.toContain("ProdSuperSecret99");
		expect(safeMsg).toContain("aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres");

		const safeArgs = redactArgs(["--data-only", `--remote=${TESTING_POOLER}`, PROD_POOLER], ["ProdSuperSecret99"]);
		expect(safeArgs.join(" ")).not.toContain("TestP");
		expect(safeArgs.join(" ")).not.toContain("ProdSuperSecret99");
		expect(safeArgs[1]).toContain("<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres");
	});

	it("does not garble protocol/username when local default password is 'postgres'", () => {
		const secrets = [...extractUrlPassword(LOCAL_DB_URL), ...extractUrlPassword(TESTING_POOLER)];
		expect(secrets).not.toContain("postgres");
		const safeArgs = redactArgs(["--file", "/tmp/x.sql", LOCAL_DB_URL, TESTING_POOLER], secrets);
		expect(safeArgs[2]).toBe("postgresql://postgres:<redacted>@127.0.0.1:54322/postgres");
		expect(safeArgs[3]).toBe(
			"postgresql://postgres.ckpozotzgubrjbjstvjg:<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
		);
	});

	it("dbHost never exposes credentials", () => {
		expect(dbHost(TESTING_POOLER)).toBe("aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres");
		expect(dbHost(LOCAL_DB_URL)).toBe("127.0.0.1:54322/postgres");
	});
});

describe("safety guards (validatePoolerUrl & validateSyncPlan)", () => {
	it("rejects source === target", () => {
		for (const env of ["local", "testing", "production"]) {
			const res = validateSyncPlan({
				source: env,
				target: env,
				yesProduction: true,
				sourceUrl: env === "local" ? LOCAL_DB_URL : TESTING_POOLER,
				targetUrl: env === "local" ? LOCAL_DB_URL : TESTING_POOLER,
			});
			expect(res.ok).toBe(false);
			expect(res.error).toMatch(/identical/i);
		}
	});

	it("rejects targeting production without --yes-production, and allows with it", () => {
		const blocked = validateSyncPlan({
			source: "testing",
			target: "production",
			yesProduction: false,
			sourceUrl: TESTING_POOLER,
			targetUrl: PROD_POOLER,
		});
		expect(blocked.ok).toBe(false);
		expect(blocked.error).toMatch(/--yes-production/);

		const allowed = validateSyncPlan({
			source: "testing",
			target: "production",
			yesProduction: true,
			sourceUrl: TESTING_POOLER,
			targetUrl: PROD_POOLER,
		});
		expect(allowed.ok).toBe(true);
		expect(allowed.warnings).toEqual([]);
	});

	it("allows pulling FROM production into local without --yes-production", () => {
		const res = validateSyncPlan({
			source: "production",
			target: "local",
			yesProduction: false,
			sourceUrl: PROD_POOLER,
			targetUrl: LOCAL_DB_URL,
		});
		expect(res.ok).toBe(true);
	});

	it("rejects IPv6-only Supabase direct hosts (db.<ref>.supabase.co) for remote envs", () => {
		const check = validatePoolerUrl("testing", DIRECT_IPV6_URL);
		expect(check.ok).toBe(false);
		expect(check.error).toMatch(/IPv6-only/i);
		expect(check.error).toMatch(/pooler\.supabase\.com:5432/);

		const plan = validateSyncPlan({
			source: "testing",
			target: "local",
			sourceUrl: DIRECT_IPV6_URL,
			targetUrl: LOCAL_DB_URL,
		});
		expect(plan.ok).toBe(false);
	});

	it("rejects transaction pooler port 6543 on *.pooler.supabase.com", () => {
		const check = validatePoolerUrl("testing", TX_POOLER_URL);
		expect(check.ok).toBe(false);
		expect(check.error).toMatch(/6543/);
		expect(check.error).toMatch(/5432/);
	});

	it("warns on unrecognized non-pooler remote hosts without blocking", () => {
		const check = validatePoolerUrl("testing", "postgresql://u:pw@custom-pg.internal:5432/postgres");
		expect(check.ok).toBe(true);
		expect(check.warnings.length).toBe(1);
		expect(check.warnings[0]).toMatch(/IPv4/);
	});

	it("rejects different env names that accidentally point to the same DB endpoint", () => {
		const res = validateSyncPlan({
			source: "testing",
			target: "production",
			yesProduction: true,
			sourceUrl: TESTING_POOLER,
			targetUrl: TESTING_POOLER,
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/same database endpoint/i);
	});
});

describe("command argument & SQL generation", () => {
	it("builds exact pg_dump args excluding every auth/env/runtime table and excluding derived by default", () => {
		const args = buildPgDumpArgs({
			sourceUrl: TESTING_POOLER,
			outputFile: "/tmp/out.sql",
		});
		expect(args).toContain("--data-only");
		expect(args).toContain("--no-owner");
		expect(args).toContain("--no-privileges");
		expect(args).toContain("--column-inserts");
		expect(args).toContain("--schema=public");
		expect(args).not.toContain(`--schema=${DERIVED_SCHEMA}`);
		for (const table of EXCLUDED_TABLES) {
			expect(args).toContain(`--exclude-table=public.${table}`);
		}
		expect(args.slice(-3)).toEqual(["--file", "/tmp/out.sql", TESTING_POOLER]);
	});

	it("includes --schema=derived in pg_dump args when includeDerived is true", () => {
		const args = buildPgDumpArgs({
			sourceUrl: TESTING_POOLER,
			includeDerived: true,
		});
		expect(args).toContain("--schema=public");
		expect(args).toContain(`--schema=${DERIVED_SCHEMA}`);
		expect(args.at(-1)).toBe(TESTING_POOLER);
	});

	it("builds exact supabase db dump args for remote and local sources", () => {
		const remoteArgs = buildSupabaseDumpArgs({
			source: "testing",
			sourceUrl: TESTING_POOLER,
			includeDerived: false,
			outputFile: "/tmp/dump.sql",
		});
		expect(remoteArgs.slice(0, 5)).toEqual(["db", "dump", "--data-only", "--schema", "public"]);
		const excludeIdx = remoteArgs.indexOf("--exclude");
		expect(excludeIdx).toBeGreaterThan(-1);
		const excludedArg = remoteArgs[excludeIdx + 1].split(",");
		expect(excludedArg).toContain("public.users");
		expect(excludedArg).toContain("public.credentials");
		expect(excludedArg).toContain("public._emdash_api_tokens");
		expect(excludedArg.length).toBe(EXCLUDED_TABLES.length);
		expect(remoteArgs).toContain(`--remote=${TESTING_POOLER}`);
		expect(remoteArgs).toContain("--file");

		const localArgs = buildSupabaseDumpArgs({
			source: "local",
			sourceUrl: LOCAL_DB_URL,
			includeDerived: true,
		});
		expect(localArgs).toContain("public,derived");
		expect(localArgs.some((a: string) => a.startsWith("--remote="))).toBe(false);
	});

	it("builds transactional psql restore args with ON_ERROR_STOP=1", () => {
		const args = buildPsqlRestoreArgs({
			targetUrl: LOCAL_DB_URL,
			sqlFile: "/tmp/restore.sql",
		});
		expect(args).toEqual([
			"--single-transaction",
			"--set",
			"ON_ERROR_STOP=1",
			"--no-psqlrc",
			"--file",
			"/tmp/restore.sql",
			LOCAL_DB_URL,
		]);
	});

	it("builds FK-safe truncate + restore SQL without CASCADE and strips redundant session directives", () => {
		const truncateDefault = buildTruncateSql({ includeDerived: false });
		expect(truncateDefault).toContain("schemaname = 'public'");
		expect(truncateDefault).toContain("'users'");
		expect(truncateDefault).toContain("'credentials'");
		expect(truncateDefault).not.toContain("schemaname = 'derived'");
		expect(truncateDefault).not.toMatch(/\bCASCADE\b/i);

		const truncateWithDerived = buildTruncateSql({ includeDerived: true });
		expect(truncateWithDerived).toContain("schemaname = 'derived'");

		const wrapped = buildRestoreSql({
			dumpSql: "SET session_replication_role = replica;\nINSERT INTO public.ec_posts (id) VALUES ('1');\nRESET ALL;\n",
			includeDerived: false,
		});
		expect(wrapped).toMatch(/^-- Generated by .*\nSET session_replication_role = 'replica';/);
		expect(wrapped).toContain("TRUNCATE TABLE");
		expect(wrapped).toContain("INSERT INTO public.ec_posts (id) VALUES ('1');");
		expect(wrapped.trimEnd().endsWith("SET session_replication_role = 'origin';")).toBe(true);
		expect(wrapped).not.toMatch(/^RESET ALL;/m);
	});

	it("rejects unsafe SQL identifiers in excluded table lists", () => {
		expect(() =>
			buildPgDumpArgs({ sourceUrl: TESTING_POOLER, excludedTables: ["users; DROP TABLE ec_posts;--"] }),
		).toThrow(/Invalid SQL/);
		expect(() => buildTruncateSql({ excludedTables: ["users' OR '1'='1"] })).toThrow(/Invalid SQL/);
	});
});

describe("parseCliArgs", () => {
	it("defaults --to to local", () => {
		const res = parseCliArgs(["testing"]);
		expect(res).toEqual({
			ok: true,
			opts: {
				source: "testing",
				target: "local",
				dryRun: false,
				includeDerived: false,
				yesProduction: false,
				dumpFile: undefined,
				tool: "auto",
				help: false,
			},
		});
	});

	it("parses all flags cleanly", () => {
		const res = parseCliArgs([
			"testing",
			"--to",
			"production",
			"--dry-run",
			"--include-derived",
			"--yes-production",
			"--dump-file",
			"/tmp/out.sql",
			"--tool=pg_dump",
		]);
		expect(res).toEqual({
			ok: true,
			opts: {
				source: "testing",
				target: "production",
				dryRun: true,
				includeDerived: true,
				yesProduction: true,
				dumpFile: "/tmp/out.sql",
				tool: "pg_dump",
				help: false,
			},
		});
	});

	it("rejects missing source, unknown flags, and invalid --tool", () => {
		expect(parseCliArgs([]).ok).toBe(false);
		expect(parseCliArgs(["testing", "--bogus"]).ok).toBe(false);
		expect(parseCliArgs(["testing", "--to"]).ok).toBe(false);
		expect(parseCliArgs(["testing", "--tool", "mysql"]).ok).toBe(false);
	});
});
