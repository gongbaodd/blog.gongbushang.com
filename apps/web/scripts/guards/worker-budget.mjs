#!/usr/bin/env node
// Free-tier guard (INF-6): verify Cloudflare Workers Free bundle size and static asset count.
// Default headroom margins: 60 MiB uncompressed (.js/.mjs/.wasm, hard limit 64 MiB) and 18,000 files (hard limit 20,000).

import { appendFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_MAX_MIB = 60;
export const DEFAULT_MAX_ASSETS = 18000;
export const CLOUDFLARE_HARD_MAX_MIB = 64;
export const CLOUDFLARE_HARD_MAX_ASSETS = 20000;
export const WORKER_EXTENSIONS = new Set([".js", ".mjs", ".wasm"]);

const MIB = 1024 * 1024;

function assertDirectory(dirPath, label) {
	let stats;
	try {
		stats = statSync(dirPath);
	} catch {
		throw new Error(`${label} directory does not exist: ${dirPath}`);
	}
	if (!stats.isDirectory()) {
		throw new Error(`${label} path is not a directory: ${dirPath}`);
	}
}

function walkFiles(dirPath, onFile) {
	const entries = readdirSync(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dirPath, entry.name);
		if (entry.isDirectory()) {
			walkFiles(fullPath, onFile);
		} else if (entry.isFile()) {
			onFile(fullPath);
		}
	}
}

/**
 * Measure total uncompressed bytes of .js, .mjs, and .wasm files in workerDir.
 */
export function measureWorkerBundle(workerDir) {
	assertDirectory(workerDir, "worker");
	let bytes = 0;
	let fileCount = 0;
	const byExtension = { ".js": 0, ".mjs": 0, ".wasm": 0 };

	walkFiles(workerDir, (filePath) => {
		const ext = extname(filePath).toLowerCase();
		if (!WORKER_EXTENSIONS.has(ext)) return;
		const size = statSync(filePath).size;
		bytes += size;
		fileCount += 1;
		byExtension[ext] += size;
	});

	return {
		dir: workerDir,
		bytes,
		mib: bytes / MIB,
		fileCount,
		byExtension,
	};
}

/**
 * Count all static asset files recursively inside assetsDir.
 */
export function countStaticAssets(assetsDir) {
	assertDirectory(assetsDir, "assets");
	let count = 0;
	walkFiles(assetsDir, () => {
		count += 1;
	});
	return {
		dir: assetsDir,
		count,
	};
}

/**
 * Evaluate worker bundle size and static asset count against free-tier budgets.
 */
export function evaluateWorkerBudget({
	workerDir,
	assetsDir,
	maxMib = DEFAULT_MAX_MIB,
	maxAssets = DEFAULT_MAX_ASSETS,
}) {
	if (!workerDir && !assetsDir) {
		throw new Error("At least one of --worker-dir or --assets-dir must be provided");
	}
	if (!Number.isFinite(maxMib) || maxMib <= 0) {
		throw new Error(`--max-mib must be a positive number (got ${maxMib})`);
	}
	if (!Number.isInteger(maxAssets) || maxAssets < 0) {
		throw new Error(`--max-assets must be a non-negative integer (got ${maxAssets})`);
	}

	const maxBytes = maxMib * MIB;
	const worker = workerDir ? measureWorkerBundle(workerDir) : null;
	const assets = assetsDir ? countStaticAssets(assetsDir) : null;
	const violations = [];

	if (worker && worker.bytes > maxBytes) {
		violations.push(
			`Worker uncompressed bundle ${worker.mib.toFixed(2)} MiB (${worker.bytes} bytes) exceeds budget ${maxMib} MiB (Cloudflare limit ${CLOUDFLARE_HARD_MAX_MIB} MiB)`,
		);
	}
	if (assets && assets.count > maxAssets) {
		violations.push(
			`Static asset count ${assets.count} exceeds budget ${maxAssets} (Cloudflare limit ${CLOUDFLARE_HARD_MAX_ASSETS})`,
		);
	}

	return {
		ok: violations.length === 0,
		maxMib,
		maxBytes,
		maxAssets,
		worker,
		assets,
		violations,
	};
}

/** Render a Markdown summary for $GITHUB_STEP_SUMMARY. */
export function formatBudgetMarkdown(result) {
	const lines = [
		`### Worker Free-Tier Budget (${result.ok ? "OK" : "FAIL"})`,
		"",
		"| Check | Measured | Budget | Hard Limit |",
		"|---|---|---|---|",
	];
	if (result.worker) {
		lines.push(
			`| Worker uncompressed (.js/.mjs/.wasm) | ${result.worker.mib.toFixed(2)} MiB (${result.worker.fileCount} files) | <= ${result.maxMib} MiB | ${CLOUDFLARE_HARD_MAX_MIB} MiB |`,
		);
	}
	if (result.assets) {
		lines.push(
			`| Static assets | ${result.assets.count.toLocaleString("en-US")} | <= ${result.maxAssets.toLocaleString("en-US")} | ${CLOUDFLARE_HARD_MAX_ASSETS.toLocaleString("en-US")} |`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

function parseNumberFlag(raw, flagName, { integer = false } = {}) {
	const text = String(raw ?? "").trim();
	if (!text) throw new Error(`${flagName} requires a numeric value`);
	const num = Number(text);
	if (!Number.isFinite(num) || (integer && !Number.isInteger(num))) {
		throw new Error(`${flagName} must be a valid ${integer ? "integer" : "number"} (got "${text}")`);
	}
	return num;
}

/**
 * Execute the worker budget check with injectable I/O for testing.
 */
export function runWorkerBudget({
	workerDir,
	assetsDir,
	maxMib = DEFAULT_MAX_MIB,
	maxAssets = DEFAULT_MAX_ASSETS,
	json = false,
	summaryPath = process.env.GITHUB_STEP_SUMMARY,
	stdout = (line) => console.log(line),
	stderr = (line) => console.error(line),
}) {
	const result = evaluateWorkerBudget({ workerDir, assetsDir, maxMib, maxAssets });

	if (summaryPath) {
		appendFileSync(summaryPath, `${formatBudgetMarkdown(result)}\n`, "utf8");
	}

	if (json) {
		stdout(JSON.stringify(result, null, 2));
	} else {
		const parts = [];
		if (result.worker) {
			parts.push(
				`worker uncompressed=${result.worker.mib.toFixed(2)} MiB (budget ${result.maxMib} MiB, limit ${CLOUDFLARE_HARD_MAX_MIB} MiB)`,
			);
		}
		if (result.assets) {
			parts.push(
				`static assets=${result.assets.count} (budget ${result.maxAssets}, limit ${CLOUDFLARE_HARD_MAX_ASSETS})`,
			);
		}
		stdout(parts.join(", "));
		for (const msg of result.violations) {
			stderr(`::error::${msg}`);
		}
	}

	return result.ok ? 0 : 1;
}

export function printHelp(write = console.log) {
	write(
		[
			"Usage: node apps/web/scripts/guards/worker-budget.mjs [options]",
			"",
			"Check Cloudflare Workers Free uncompressed bundle size (.js/.mjs/.wasm) and static asset count.",
			"At least one of --worker-dir or --assets-dir is required.",
			"",
			"Options:",
			"  --worker-dir <path>   Directory containing wrangler dry-run output",
			"  --assets-dir <path>   Directory containing static assets (e.g. apps/web/dist/client)",
			`  --max-mib <n>         Max uncompressed Worker bundle size in MiB (default: ${DEFAULT_MAX_MIB})`,
			`  --max-assets <n>      Max static asset file count (default: ${DEFAULT_MAX_ASSETS})`,
			"  --json                Emit JSON output to stdout",
			"  -h, --help            Show this help message",
		].join("\n"),
	);
}

function main() {
	const { values } = parseArgs({
		options: {
			"worker-dir": { type: "string" },
			"assets-dir": { type: "string" },
			"max-mib": { type: "string", default: String(DEFAULT_MAX_MIB) },
			"max-assets": { type: "string", default: String(DEFAULT_MAX_ASSETS) },
			json: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: false,
	});

	if (values.help) {
		printHelp();
		return 0;
	}

	const maxMib = parseNumberFlag(values["max-mib"], "--max-mib");
	const maxAssets = parseNumberFlag(values["max-assets"], "--max-assets", { integer: true });

	return runWorkerBudget({
		workerDir: values["worker-dir"],
		assetsDir: values["assets-dir"],
		maxMib,
		maxAssets,
		json: Boolean(values.json),
	});
}

function isMainModule() {
	if (!process.argv[1]) return false;
	try {
		return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
	} catch {
		return import.meta.url === pathToFileURL(process.argv[1]).href;
	}
}

if (isMainModule()) {
	try {
		process.exitCode = main();
	} catch (err) {
		console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
		process.exitCode = 1;
	}
}
