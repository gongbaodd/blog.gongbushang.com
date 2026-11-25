#!/usr/bin/env node
// INF-5: Pull EmDash content between Supabase Postgres environments through the IPv4 session pooler,
// excluding all auth, passkey, session, OAuth, encrypted-plugin, and env-state tables (D4, D11).
//
// Usage:
//   node apps/web/scripts/sync/pull.mjs <source> [--to <target>] [--dry-run] [--include-derived] [--include-comments] [--yes] [--yes-production] [--dump-file <path>] [--tool <auto|pg_dump|supabase>]
//
// Run through `pnpm content:pull <source> [options]` (root) or `pnpm --filter web content:pull ...`.
// Default --to is `local`, so `pull.mjs production` syncs production -> local (the main use case).
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	DERIVED_SCHEMA,
	COMMENT_TABLES,
	EXCLUDED_AUTH_TABLES,
	EXCLUDED_ENV_STATE_TABLES,
	EXCLUDED_OPERATIONAL_TABLES,
	EXCLUDED_RUNTIME_TABLES,
	buildPgDumpArgs,
	buildPsqlRestoreArgs,
	buildRestoreSql,
	buildSupabaseDumpArgs,
	dbHost,
	extractUrlPassword,
	getExcludedTables,
	parseCliArgs,
	parseEnvText,
	redactArgs,
	redactText,
	resolveEnvUrl,
	resolveExpectedRefs,
	splitUrlCredentials,
	validateSyncPlan,
} from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const repoRoot = resolve(webDir, "../..");

const USAGE = `Usage:
  node apps/web/scripts/sync/pull.mjs <source> [options]

Arguments:
  <source>              Source environment: local | production

Options:
  --to <target>         Target environment: local | production (default: local)
  --dry-run             Print redacted plan, excluded tables, and exact commands without mutating any DB
  --include-derived     Also sync the "${DERIVED_SCHEMA}" cache schema (excluded by default)
  --include-comments    Also sync visitor comments and reactions (PII; excluded by default)
  --yes                 Skip the interactive "type the target env name" confirmation
  --yes-production      Required when the target IS production (decided by Supabase project ref, not
                        by the label), in addition to the confirmation
  --dump-file <path>    Write raw data-only SQL dump to <path> and KEEP it on disk. The dump is
                        PLAINTEXT content (and comments with --include-comments); delete it yourself
  --tool <mode>         Dump binary: auto | pg_dump | supabase (default: auto)
  -h, --help            Show this help message`;

function die(msg, code = 1) {
	console.error(`[sync] ${msg}`);
	process.exit(code);
}

/** Thrown inside the execute phase so `finally` cleanup of plaintext dumps always runs. */
class SyncError extends Error {}
const fail = (msg) => {
	throw new SyncError(msg);
};

function commandExists(bin) {
	const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
	return !r.error && r.status === 0;
}

function formatCmdForDisplay(bin, args, secrets) {
	return [bin, ...redactArgs(args, secrets)].join(" ");
}

const parsed = parseCliArgs(process.argv.slice(2));
if (!parsed.ok) {
	console.error(`[sync] ${parsed.error}\n\n${USAGE}`);
	process.exit(2);
}

const { opts } = parsed;
if (opts.help) {
	console.log(USAGE);
	process.exit(0);
}

// ---- 1. Load repo-root .env (read-only; optional if vars are already exported in process.env) ----
const envFile = process.env.GROWGEN_ENV_FILE || resolve(repoRoot, ".env");
const dotEnv = existsSync(envFile) ? parseEnvText(readFileSync(envFile, "utf8")) : {};

const srcResolved = resolveEnvUrl(opts.source, dotEnv, process.env);
if (!srcResolved.ok) {
	die(
		srcResolved.error ??
			`missing ${srcResolved.missing.join(", ")} for source "${opts.source}" (checked process.env and ${envFile})`,
		2,
	);
}

const dstResolved = resolveEnvUrl(opts.target, dotEnv, process.env);
if (!dstResolved.ok) {
	die(
		dstResolved.error ??
			`missing ${dstResolved.missing.join(", ")} for target "${opts.target}" (checked process.env and ${envFile})`,
		2,
	);
}

const secrets = [
	srcResolved.url,
	dstResolved.url,
	...extractUrlPassword(srcResolved.url),
	...extractUrlPassword(dstResolved.url),
];
const safe = (text) => redactText(text, secrets);

// ---- 2. Validate safety guards (self-sync, production flag, IPv4 session pooler) -----------------
const planCheck = validateSyncPlan({
	source: opts.source,
	target: opts.target,
	yesProduction: opts.yesProduction,
	sourceUrl: srcResolved.url,
	targetUrl: dstResolved.url,
	expectedRefs: resolveExpectedRefs(dotEnv, process.env),
});
if (!planCheck.ok) {
	die(safe(planCheck.error), 2);
}

const excludedTables = getExcludedTables({ includeComments: opts.includeComments });

// ---- 3. Select dump tool and build exact argument arrays -----------------------------------------
let dumpBin = opts.tool;
if (dumpBin === "auto") {
	if (commandExists("pg_dump")) {
		dumpBin = "pg_dump";
	} else if (commandExists("supabase")) {
		dumpBin = "supabase";
	} else {
		dumpBin = "pg_dump";
	}
}

const dumpPathForPlan = opts.dumpFile ? resolve(opts.dumpFile) : "<tmp>/content-dump.sql";
const restorePathForPlan = "<tmp>/content-restore.sql";

const buildDumpInvocation = (outputFile, sourceUrl = srcResolved.url) =>
	dumpBin === "supabase"
		? {
				bin: "supabase",
				args: buildSupabaseDumpArgs({
					source: opts.source,
					sourceUrl,
					excludedTables,
					includeDerived: opts.includeDerived,
					outputFile,
				}),
			}
		: {
				bin: "pg_dump",
				args: buildPgDumpArgs({
					sourceUrl,
					excludedTables,
					includeDerived: opts.includeDerived,
					outputFile,
				}),
			};

const planDump = buildDumpInvocation(dumpPathForPlan);
const planRestoreArgs = buildPsqlRestoreArgs({
	targetUrl: dstResolved.url,
	sqlFile: restorePathForPlan,
});

// ---- 4. Print redacted plan ----------------------------------------------------------------------
console.log(`[sync] Plan (${opts.dryRun ? "DRY RUN" : "EXECUTE"}):`);
console.log(`  Source:          ${opts.source} (${dbHost(srcResolved.url)})`);
console.log(`  Target:          ${opts.target} (${dbHost(dstResolved.url)})`);
console.log(`  Schemas:         ${opts.includeDerived ? `public, ${DERIVED_SCHEMA}` : "public (derived cache excluded)"}`);
console.log(`  Dump tool:       ${planDump.bin}`);
console.log(`  Excluded tables: ${excludedTables.length} public tables`);
console.log(`    - auth/passkeys/sessions (${EXCLUDED_AUTH_TABLES.length}): ${EXCLUDED_AUTH_TABLES.join(", ")}`);
console.log(`    - env-state/secrets/migrations (${EXCLUDED_ENV_STATE_TABLES.length}): ${EXCLUDED_ENV_STATE_TABLES.join(", ")}`);
console.log(`    - ephemeral runtime (${EXCLUDED_RUNTIME_TABLES.length}): ${EXCLUDED_RUNTIME_TABLES.join(", ")}`);
console.log(`    - operational indexes/artifacts (${EXCLUDED_OPERATIONAL_TABLES.length}): ${EXCLUDED_OPERATIONAL_TABLES.join(", ")}`);
console.log(
	opts.includeComments
		? `    - comments (PII) INCLUDED via --include-comments: ${COMMENT_TABLES.join(", ")}`
		: `    - comments (PII, pass --include-comments to sync) (${COMMENT_TABLES.length}): ${COMMENT_TABLES.join(", ")}`,
);
if (opts.dumpFile) {
	console.log(`  WARNING: --dump-file keeps a PLAINTEXT SQL dump of the content at ${dumpPathForPlan}; delete it when done.`);
}
console.log(`  Target is production: ${planCheck.targetIsProduction ? "YES (by project ref or label)" : "no"}`);
for (const warning of planCheck.warnings) {
	console.warn(`[sync] WARNING: ${safe(warning)}`);
}
console.log(`\n[sync] Dump command (redacted):`);
console.log(`  ${formatCmdForDisplay(planDump.bin, planDump.args, secrets)}`);
console.log(`\n[sync] Restore command (redacted):`);
console.log(`  ${formatCmdForDisplay("psql", planRestoreArgs, secrets)}`);

if (opts.dryRun) {
	console.log("\n[sync] Dry run complete — no database was read or modified.");
	process.exit(0);
}

// ---- 5. Verify required binaries exist before mutating anything ----------------------------------
if (!commandExists(planDump.bin)) {
	die(
		`"${planDump.bin}" was not found on PATH. Install postgresql-client (libpq) or pass --tool supabase.`,
	);
}
if (!commandExists("psql")) {
	die(`"psql" was not found on PATH. Install postgresql-client (e.g. brew install libpq) to restore dumps.`);
}

// ---- 5b. Interactive confirmation ----------------------------------------------------------------
if (!opts.yes) {
	if (!process.stdin.isTTY) {
		die(`refusing to overwrite "${opts.target}" non-interactively; pass --yes to confirm.`, 2);
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = (await rl.question(`\nThis OVERWRITES content in "${opts.target}". Type "${opts.target}" to continue: `)).trim();
	rl.close();
	if (answer !== opts.target) {
		die("confirmation did not match; aborted.", 2);
	}
}

// ---- 6. Execute dump -> wrap transactional truncate+restore -> execute psql ----------------------
// Passwords travel in PGPASSWORD (never argv). `fail()` throws so `finally` always removes the plaintext
// working directory; only an explicit --dump-file survives.
const workDir = mkdtempSync(join(tmpdir(), "growgen-sync-"));
chmodSync(workDir, 0o700);

const rawDumpFile = opts.dumpFile ? resolve(opts.dumpFile) : join(workDir, "content-dump.sql");
const restoreSqlFile = join(workDir, "content-restore.sql");
const srcCreds = splitUrlCredentials(srcResolved.url);
const dstCreds = splitUrlCredentials(dstResolved.url);
const childEnv = (extra) => ({ ...process.env, ...extra });

// Pre-create the dump with mode 0600 so pg_dump (which truncates/writes in place) never exposes it.
writeFileSync(rawDumpFile, "", { mode: 0o600 });
chmodSync(rawDumpFile, 0o600);
for (const sig of ["SIGINT", "SIGTERM"]) {
	process.on(sig, () => {
		rmSync(workDir, { recursive: true, force: true });
		process.exit(130);
	});
}

let exitCode = 0;
try {
	console.log(`\n[sync] Dumping content from ${opts.source} (${dbHost(srcResolved.url)})...`);
	const liveDump = buildDumpInvocation(rawDumpFile, srcCreds.url);
	const dumpRes = spawnSync(liveDump.bin, liveDump.args, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		env: childEnv(srcCreds.env),
	});
	if (dumpRes.error) {
		fail(`failed to spawn ${liveDump.bin}: ${safe(dumpRes.error.message)}`);
	}
	if (dumpRes.status !== 0) {
		fail(`${liveDump.bin} exited with code ${dumpRes.status}:\n${safe(dumpRes.stderr || dumpRes.stdout)}`);
	}

	const rawSql = readFileSync(rawDumpFile, "utf8");
	const wrappedSql = buildRestoreSql({
		dumpSql: rawSql,
		excludedTables,
		includeDerived: opts.includeDerived,
	});
	writeFileSync(restoreSqlFile, wrappedSql, { mode: 0o600 });
	chmodSync(restoreSqlFile, 0o600);

	console.log(`[sync] Restoring into ${opts.target} (${dbHost(dstResolved.url)}) in a single transaction...`);
	const liveRestoreArgs = buildPsqlRestoreArgs({
		targetUrl: dstCreds.url,
		sqlFile: restoreSqlFile,
	});
	const restoreRes = spawnSync("psql", liveRestoreArgs, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		env: childEnv(dstCreds.env),
	});
	if (restoreRes.error) {
		fail(`failed to spawn psql: ${safe(restoreRes.error.message)}`);
	}
	if (restoreRes.status !== 0) {
		fail(`psql exited with code ${restoreRes.status} (transaction rolled back):\n${safe(restoreRes.stderr || restoreRes.stdout)}`);
	}

	console.log(`[sync] Done: synced ${opts.source} -> ${opts.target}${opts.dumpFile ? ` (PLAINTEXT dump kept at ${rawDumpFile}; delete it when done)` : ""}.`);
} catch (err) {
	console.error(`[sync] ${err instanceof SyncError ? err.message : safe(String(err?.stack ?? err))}`);
	exitCode = 1;
} finally {
	rmSync(workDir, { recursive: true, force: true });
}
process.exit(exitCode);
