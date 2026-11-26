import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper
import {
	DERIVED_SCHEMA,
	EXCLUDED_AUTH_TABLES,
	EXCLUDED_ENV_STATE_TABLES,
	EXCLUDED_RUNTIME_TABLES,
	EXCLUDED_TABLES,
	BASE_EXCLUDED_TABLES,
	COMMENT_TABLES,
	EXCLUDED_OPERATIONAL_TABLES,
	LOCAL_DB_URL,
	classifyPublicTable,
	getExcludedTables,
	parseProjectRef,
	resolveExpectedRefs,
	splitUrlCredentials,
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

// Fixture URLs are assembled at runtime from obviously fake parts, so no literal `user:password@host`
// string sits in the repo for secret scanners (GitGuardian) to flag. None of these are real credentials.
const FAKE_PW = {
	prod: "fixture%40pw-a", // URL-encoded; decodes to "fixture@pw-a"
	prodDecoded: "fixture@pw-a",
	retired: "fixture-pw-b",
	direct: "fixture-pw-c",
	tx: "fixture-pw-d",
	other: "fixture-pw-e",
	old: "fixture-pw-f",
	leaked: "fixture-pw-g",
};
const pgUrl = (user: string, pw: string, hostPort: string) => ["postgresql://", user, ":", pw, "@", hostPort, "/postgres"].join("");

const PROD_POOLER =
	pgUrl("postgres.ckpozotzgubrjbjstvjg", FAKE_PW.prod, "aws-0-ap-southeast-1.pooler.supabase.com:5432");
// The former production project (retired by INF-10): a valid-looking pooler URL whose ref is NOT SUPABASE_PRODUCTION_REF any more.
const RETIRED_POOLER =
	pgUrl("postgres.epewqznhtgjirbfeqfrj", FAKE_PW.retired, "aws-1-ap-southeast-1.pooler.supabase.com:5432");
const RETIRED_REF = "epewqznhtgjirbfeqfrj";
// INF-10: one remote environment. The former testing project is production now.
const REFS = { production: "ckpozotzgubrjbjstvjg" };
const DIRECT_IPV6_URL =
	pgUrl("postgres", FAKE_PW.direct, "db.ckpozotzgubrjbjstvjg.supabase.co:5432");
const TX_POOLER_URL =
	pgUrl("postgres.ckpozotzgubrjbjstvjg", FAKE_PW.tx, "aws-0-ap-southeast-1.pooler.supabase.com:6543");

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
		const dotEnv = { SUPABASE_PRODUCTION_POOLER_URL: pgUrl("u", FAKE_PW.old, "aws-0.pooler.supabase.com:5432") };
		const procEnv = { SUPABASE_PRODUCTION_POOLER_URL: PROD_POOLER };
		const res = resolveEnvUrl("production", dotEnv, procEnv);
		expect(res).toMatchObject({ ok: true, env: "production", url: PROD_POOLER });
	});

	it("reports missing variable name for production when unset", () => {
		const res = resolveEnvUrl("production", {}, {});
		expect(res).toEqual({ ok: false, missing: ["SUPABASE_PRODUCTION_POOLER_URL"] });
	});

	it("rejects unknown environments and malformed URLs", () => {
		expect(resolveEnvUrl("staging", {}, {}).ok).toBe(false);
		expect(resolveEnvUrl("testing", { SUPABASE_TESTING_POOLER_URL: PROD_POOLER }, {}).ok).toBe(false); // retired by INF-10
		expect(resolveEnvUrl("production", { SUPABASE_PRODUCTION_POOLER_URL: "https://not-postgres.example" }, {}).ok).toBe(
			false,
		);
	});
});

describe("password redaction", () => {
	it("masks passwords in postgres URLs while keeping host/port/db readable", () => {
		const masked = maskPostgresUrl(PROD_POOLER);
		expect(masked).toBe(
			"postgresql://postgres.ckpozotzgubrjbjstvjg:<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
		);
		expect(masked).not.toContain("fixture");
	});

	it("redacts URLs and secrets inside arbitrary log text and arg arrays", () => {
		const msg = `pg_dump failed connecting to ${RETIRED_POOLER} with key ${FAKE_PW.retired}`;
		const safeMsg = redactText(msg, [FAKE_PW.retired]);
		expect(safeMsg).not.toContain(FAKE_PW.retired);
		expect(safeMsg).toContain("aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres");

		const safeArgs = redactArgs(["--data-only", `--remote=${PROD_POOLER}`, RETIRED_POOLER], [FAKE_PW.retired]);
		expect(safeArgs.join(" ")).not.toContain("fixture");
		expect(safeArgs.join(" ")).not.toContain(FAKE_PW.retired);
		expect(safeArgs[1]).toContain("<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres");
	});

	it("does not garble protocol/username when local default password is 'postgres'", () => {
		const secrets = [...extractUrlPassword(LOCAL_DB_URL), ...extractUrlPassword(PROD_POOLER)];
		expect(secrets).not.toContain("postgres");
		const safeArgs = redactArgs(["--file", "/tmp/x.sql", LOCAL_DB_URL, PROD_POOLER], secrets);
		expect(safeArgs[2]).toBe("postgresql://postgres:<redacted>@127.0.0.1:54322/postgres");
		expect(safeArgs[3]).toBe(
			"postgresql://postgres.ckpozotzgubrjbjstvjg:<redacted>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
		);
	});

	it("dbHost never exposes credentials", () => {
		expect(dbHost(PROD_POOLER)).toBe("aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres");
		expect(dbHost(LOCAL_DB_URL)).toBe("127.0.0.1:54322/postgres");
	});
});

describe("safety guards (validatePoolerUrl & validateSyncPlan)", () => {
	it("rejects source === target", () => {
		for (const env of ["local", "production"]) {
			const res = validateSyncPlan({
				expectedRefs: REFS,
				source: env,
				target: env,
				yesProduction: true,
				sourceUrl: env === "local" ? LOCAL_DB_URL : PROD_POOLER,
				targetUrl: env === "local" ? LOCAL_DB_URL : PROD_POOLER,
			});
			expect(res.ok).toBe(false);
			expect(res.error).toMatch(/identical/i);
		}
	});

	it("rejects targeting production without --yes-production, and allows with it", () => {
		const blocked = validateSyncPlan({
				expectedRefs: REFS,
			source: "local",
			target: "production",
			yesProduction: false,
			sourceUrl: LOCAL_DB_URL,
			targetUrl: PROD_POOLER,
		});
		expect(blocked.ok).toBe(false);
		expect(blocked.error).toMatch(/--yes-production/);

		const allowed = validateSyncPlan({
				expectedRefs: REFS,
			source: "local",
			target: "production",
			yesProduction: true,
			sourceUrl: LOCAL_DB_URL,
			targetUrl: PROD_POOLER,
		});
		expect(allowed.ok).toBe(true);
		expect(allowed.warnings).toEqual([]);
	});

	it("allows pulling FROM production into local without --yes-production", () => {
		const res = validateSyncPlan({
				expectedRefs: REFS,
			source: "production",
			target: "local",
			yesProduction: false,
			sourceUrl: PROD_POOLER,
			targetUrl: LOCAL_DB_URL,
		});
		expect(res.ok).toBe(true);
	});

	it("rejects IPv6-only Supabase direct hosts (db.<ref>.supabase.co) for remote envs", () => {
		const check = validatePoolerUrl("production", DIRECT_IPV6_URL);
		expect(check.ok).toBe(false);
		expect(check.error).toMatch(/IPv6-only/i);
		expect(check.error).toMatch(/pooler\.supabase\.com:5432/);

		const plan = validateSyncPlan({
				expectedRefs: REFS,
			source: "production",
			target: "local",
			sourceUrl: DIRECT_IPV6_URL,
			targetUrl: LOCAL_DB_URL,
		});
		expect(plan.ok).toBe(false);
	});

	it("rejects transaction pooler port 6543 on *.pooler.supabase.com", () => {
		const check = validatePoolerUrl("production", TX_POOLER_URL);
		expect(check.ok).toBe(false);
		expect(check.error).toMatch(/6543/);
		expect(check.error).toMatch(/5432/);
	});

	it("warns on unrecognized non-pooler remote hosts without blocking", () => {
		const check = validatePoolerUrl("production", pgUrl("u", FAKE_PW.old, "custom-pg.internal:5432"));
		expect(check.ok).toBe(true);
		expect(check.warnings.length).toBe(1);
		expect(check.warnings[0]).toMatch(/IPv4/);
	});

	it("refuses the retired testing environment as source or target", () => {
		for (const [source, target] of [["testing", "local"], ["local", "testing"], ["production", "testing"]]) {
			const res = validateSyncPlan({
				expectedRefs: REFS,
				source,
				target,
				yesProduction: true,
				sourceUrl: PROD_POOLER,
				targetUrl: LOCAL_DB_URL,
			});
			expect(res.ok).toBe(false);
			expect(res.error).toMatch(/unknown (source|target) env "testing"/);
		}
	});

	it("rejects the retired project's URL labelled production (ref mismatch)", () => {
		const res = validateSyncPlan({
			expectedRefs: REFS,
			source: "production",
			target: "local",
			yesProduction: false,
			sourceUrl: RETIRED_POOLER,
			targetUrl: LOCAL_DB_URL,
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/labelled "production"/);
	});
});

describe("command argument & SQL generation", () => {
	it("builds exact pg_dump args excluding every auth/env/runtime table and excluding derived by default", () => {
		const args = buildPgDumpArgs({
			sourceUrl: PROD_POOLER,
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
		expect(args.slice(-3)).toEqual(["--file", "/tmp/out.sql", PROD_POOLER]);
	});

	it("includes --schema=derived in pg_dump args when includeDerived is true", () => {
		const args = buildPgDumpArgs({
			sourceUrl: PROD_POOLER,
			includeDerived: true,
		});
		expect(args).toContain("--schema=public");
		expect(args).toContain(`--schema=${DERIVED_SCHEMA}`);
		expect(args.at(-1)).toBe(PROD_POOLER);
	});

	it("builds exact supabase db dump args for remote and local sources", () => {
		const remoteArgs = buildSupabaseDumpArgs({
			source: "production",
			sourceUrl: PROD_POOLER,
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
		expect(remoteArgs).toContain(`--remote=${PROD_POOLER}`);
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
			buildPgDumpArgs({ sourceUrl: PROD_POOLER, excludedTables: ["users; DROP TABLE ec_posts;--"] }),
		).toThrow(/Invalid SQL/);
		expect(() => buildTruncateSql({ excludedTables: ["users' OR '1'='1"] })).toThrow(/Invalid SQL/);
	});
});

describe("parseCliArgs", () => {
	it("defaults --to to local", () => {
		const res = parseCliArgs(["production"]);
		expect(res).toEqual({
			ok: true,
			opts: {
				source: "production",
				target: "local",
				dryRun: false,
				includeDerived: false,
				yesProduction: false,
				includeComments: false,
				yes: false,
				dumpFile: undefined,
				tool: "auto",
				help: false,
			},
		});
	});

	it("parses all flags cleanly", () => {
		const res = parseCliArgs([
			"local",
			"--to",
			"production",
			"--dry-run",
			"--include-derived",
			"--include-comments",
			"--yes",
			"--yes-production",
			"--dump-file",
			"/tmp/out.sql",
			"--tool=pg_dump",
		]);
		expect(res).toEqual({
			ok: true,
			opts: {
				source: "local",
				target: "production",
				dryRun: true,
				includeDerived: true,
				yesProduction: true,
				includeComments: true,
				yes: true,
				dumpFile: "/tmp/out.sql",
				tool: "pg_dump",
				help: false,
			},
		});
	});

	it("rejects missing source, unknown flags, and invalid --tool", () => {
		expect(parseCliArgs([]).ok).toBe(false);
		expect(parseCliArgs(["production", "--bogus"]).ok).toBe(false);
		expect(parseCliArgs(["production", "--to"]).ok).toBe(false);
		expect(parseCliArgs(["production", "--tool", "mysql"]).ok).toBe(false);
	});
});

const REMOTE_AS_LOCAL =
	pgUrl("postgres.epewqznhtgjirbfeqfrj", FAKE_PW.retired, "aws-1-ap-southeast-1.pooler.supabase.com:5432");
const UNKNOWN_PROJECT =
	pgUrl("postgres.zzzzzzzzzzzzzzzzzzzz", FAKE_PW.other, "aws-1-ap-southeast-1.pooler.supabase.com:5432");

describe("production gate cannot be bypassed by mislabelling (project ref check)", () => {
	const base = { yesProduction: false, expectedRefs: REFS };

	it("parses the project ref from the pooler username", () => {
		expect(parseProjectRef(PROD_POOLER)).toBe(REFS.production);
		expect(parseProjectRef(RETIRED_POOLER)).toBe(RETIRED_REF);
		expect(parseProjectRef(LOCAL_DB_URL)).toBeUndefined();
		expect(parseProjectRef(DIRECT_IPV6_URL)).toBeUndefined();
		expect(parseProjectRef("not a url")).toBeUndefined();
	});

	it("rejects another project's URL labelled production (ref mismatch)", () => {
		const res = validateSyncPlan({ ...base, source: "local", target: "production", yesProduction: true, sourceUrl: LOCAL_DB_URL, targetUrl: RETIRED_POOLER });
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/labelled "production"/);
		expect(res.error).toMatch(/SUPABASE_PRODUCTION_REF/);
	});

	it("rejects a remote URL labelled local (non-loopback is a hard error)", () => {
		const res = validateSyncPlan({ ...base, source: "production", target: "local", sourceUrl: PROD_POOLER, targetUrl: REMOTE_AS_LOCAL });
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/non-loopback/);
		expect(validatePoolerUrl("local", REMOTE_AS_LOCAL).ok).toBe(false);
	});

	it("requires --yes-production for any restore into production, and allows pulls from it without", () => {
		const push = { ...base, source: "local", target: "production", sourceUrl: LOCAL_DB_URL, targetUrl: PROD_POOLER };
		const blocked = validateSyncPlan(push);
		expect(blocked.ok).toBe(false);
		expect(blocked.error).toMatch(/--yes-production/);
		const allowed = validateSyncPlan({ ...push, yesProduction: true });
		expect(allowed.ok).toBe(true);
		expect(allowed.targetIsProduction).toBe(true);
		const pull = validateSyncPlan({ ...base, source: "production", target: "local", sourceUrl: PROD_POOLER, targetUrl: LOCAL_DB_URL });
		expect(pull.ok).toBe(true);
		expect(pull.targetIsProduction).toBe(false);
	});

	it("fails closed when the ref is unset or the URL carries no ref", () => {
		expect(
			validateSyncPlan({ ...base, expectedRefs: {}, source: "production", target: "local", sourceUrl: PROD_POOLER, targetUrl: LOCAL_DB_URL }).error,
		).toMatch(/SUPABASE_PRODUCTION_REF/);
		const noRef = pgUrl("postgres", FAKE_PW.old, "aws-1-ap-southeast-1.pooler.supabase.com:5432");
		expect(
			validateSyncPlan({ ...base, source: "production", target: "local", sourceUrl: noRef, targetUrl: LOCAL_DB_URL }).error,
		).toMatch(/postgres\.<project-ref>/);
		expect(
			validateSyncPlan({ ...base, source: "production", target: "local", sourceUrl: UNKNOWN_PROJECT, targetUrl: LOCAL_DB_URL }).ok,
		).toBe(false);
	});

	it("resolveExpectedRefs reads SUPABASE_PRODUCTION_REF from process env then .env and ignores the retired testing ref", () => {
		expect(resolveExpectedRefs({ SUPABASE_TESTING_REF: "AbC" }, { SUPABASE_PRODUCTION_REF: "def" })).toEqual({ production: "def" });
		expect(resolveExpectedRefs({ SUPABASE_PRODUCTION_REF: "AbC" }, {})).toEqual({ production: "abc" });
	});
});

describe("credentials never travel in argv", () => {
	it("splitUrlCredentials strips the password into PGPASSWORD", () => {
		const { url, env } = splitUrlCredentials(PROD_POOLER);
		expect(url).not.toContain("fixture");
		expect(url).toContain(`postgres.${REFS.production}@`);
		expect(env).toEqual({ PGPASSWORD: FAKE_PW.prodDecoded });
		expect(splitUrlCredentials("postgresql://postgres@127.0.0.1:54322/postgres").env).toEqual({});
	});
});

describe("comments and operational tables", () => {
	it("excludes comments by default and syncs them only on opt-in", () => {
		for (const t of COMMENT_TABLES) {
			expect(getExcludedTables()).toContain(t);
			expect(getExcludedTables({ includeComments: true })).not.toContain(t);
			expect(BASE_EXCLUDED_TABLES).not.toContain(t);
		}
		expect(EXCLUDED_TABLES).toEqual(getExcludedTables());
		expect(parseCliArgs(["production", "--include-comments"]).opts.includeComments).toBe(true);
	});

	it("excludes media usage index and redirect artifacts", () => {
		for (const t of ["_emdash_media_usage_work", "_emdash_redirect_state", "_emdash_redirect_artifacts"]) {
			expect(EXCLUDED_OPERATIONAL_TABLES).toContain(t);
			expect(EXCLUDED_TABLES).toContain(t);
		}
	});
});

function localPublicTables(): string[] | undefined {
	const sql = "select tablename from pg_tables where schemaname='public' order by 1";
	const attempts: [string, string[]][] = [
		["psql", [LOCAL_DB_URL, "-Atc", sql]],
		["docker", ["exec", "supabase_db_blog.gongbushang.com", "psql", "-U", "postgres", "-Atc", sql]],
	];
	for (const [bin, args] of attempts) {
		try {
			const out = execFileSync(bin, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
			const names = out.split("\n").map((l) => l.trim()).filter(Boolean);
			if (names.length > 0) return names;
		} catch {
			// try next
		}
	}
	return undefined;
}

describe("schema drift guard (needs local Supabase with migrations applied)", () => {
	const tables = localPublicTables();
	it.skipIf(!tables)("every local public table is excluded or a known content table", () => {
		const unknown = tables!.filter((t) => classifyPublicTable(t) === "unknown");
		expect(
			unknown,
			`New public table(s) ${unknown.join(", ")}: add to an EXCLUDED_* list or KNOWN_CONTENT_TABLES in scripts/sync/lib.mjs`,
		).toEqual([]);
	});
	it("classifies by rule", () => {
		expect(classifyPublicTable("users")).toBe("excluded");
		expect(classifyPublicTable("ec_posts")).toBe("content");
		expect(classifyPublicTable("media")).toBe("content");
		expect(classifyPublicTable("brand_new_table")).toBe("unknown");
	});
});

describe("URL query parameters cannot override the verified connection", () => {
	const refs = { expectedRefs: REFS, yesProduction: false };
	const prodHostPooler = "aws-0-ap-southeast-1.pooler.supabase.com";

	it.each([
		["?user= on a production URL", `${PROD_POOLER}?user=postgres.${RETIRED_REF}`],
		["?host= on a local URL", `postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=${prodHostPooler}&user=postgres.${REFS.production}`],
		["?hostaddr= on a local URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=203.0.113.5&user=postgres.x"],
		["?port=", `${PROD_POOLER}?port=6543`],
		["?dbname=", `${PROD_POOLER}?dbname=other`],
		["?service=", `${PROD_POOLER}?service=prod`],
		["?options=", `${PROD_POOLER}?options=-c%20search_path%3Dx`],
		["?password=", `${PROD_POOLER}?password=${FAKE_PW.leaked}`],
		["?sslpassword=", `${PROD_POOLER}?sslpassword=${FAKE_PW.leaked}`],
	])("rejects %s", (_label, url) => {
		const isLocal = url.includes("127.0.0.1");
		const res = validateSyncPlan({
			...refs,
			source: isLocal ? "local" : "production",
			target: isLocal ? "production" : "local",
			sourceUrl: isLocal ? url : url,
			targetUrl: isLocal ? PROD_POOLER : LOCAL_DB_URL,
		});
		expect(res.ok).toBe(false);
		expect(res.error).toMatch(/query parameter/);
		expect(resolveEnvUrl(isLocal ? "local" : "production", {}, { [isLocal ? "SUPABASE_LOCAL_DB_URL" : "SUPABASE_PRODUCTION_POOLER_URL"]: url }).ok).toBe(false);
	});

	it("allows ?sslmode=require", () => {
		const res = validateSyncPlan({
			...refs,
			source: "production",
			target: "local",
			sourceUrl: `${PROD_POOLER}?sslmode=require`,
			targetUrl: LOCAL_DB_URL,
		});
		expect(res.ok).toBe(true);
	});

	it("accepts bracketed IPv6 loopback as local", () => {
		expect(validatePoolerUrl("local", "postgresql://postgres:postgres@[::1]:54322/postgres").ok).toBe(true);
	});
});
