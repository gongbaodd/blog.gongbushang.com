#!/usr/bin/env node
// Free-tier guard (INF-6): check Cloudinary credit usage via the Admin Usage API.
// Reads CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET from env.
// Never logs credentials or secrets.

import { appendFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_WARN_PCT = 75;
export const DEFAULT_FAIL_PCT = 90;
export const DEFAULT_API_BASE = "https://api.cloudinary.com";

const CREDENTIAL_VARS = [
	"CLOUDINARY_CLOUD_NAME",
	"CLOUDINARY_API_KEY",
	"CLOUDINARY_API_SECRET",
];

/**
 * Resolve Cloudinary credentials from environment variables.
 * Throws naming only the missing variable names (never values).
 */
export function resolveCloudinaryCredentials(env = process.env) {
	const missing = [];
	const values = {};
	for (const name of CREDENTIAL_VARS) {
		const raw = env[name];
		const val = typeof raw === "string" ? raw.trim() : "";
		if (!val) missing.push(name);
		else values[name] = val;
	}
	if (missing.length > 0) {
		throw new Error(`Missing required Cloudinary environment variable(s): ${missing.join(", ")}`);
	}
	return {
		cloudName: values.CLOUDINARY_CLOUD_NAME,
		apiKey: values.CLOUDINARY_API_KEY,
		apiSecret: values.CLOUDINARY_API_SECRET,
	};
}

/** Build an HTTP Basic Authorization header value. */
export function buildBasicAuthHeader(apiKey, apiSecret) {
	return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

function asFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parse and normalize the Cloudinary Admin `/v1_1/<cloud>/usage` JSON payload.
 */
export function parseCloudinaryUsage(payload) {
	if (!payload || typeof payload !== "object") {
		throw new Error("Cloudinary usage response is not an object");
	}
	const credits = payload.credits;
	const usage = asFiniteNumber(credits?.usage);
	const limit = asFiniteNumber(credits?.limit);
	if (usage === null || limit === null) {
		throw new Error("Cloudinary usage response missing numeric credits.usage or credits.limit");
	}
	const usedPercentField = asFiniteNumber(credits?.used_percent);
	let percent;
	if (limit > 0) {
		percent = (usage / limit) * 100;
	} else if (usedPercentField !== null) {
		percent = usedPercentField;
	} else if (usage === 0) {
		percent = 0;
	} else {
		throw new Error("Cloudinary usage response has non-positive credits.limit with positive usage");
	}

	return {
		plan: typeof payload.plan === "string" && payload.plan ? payload.plan : "unknown",
		lastUpdated: typeof payload.last_updated === "string" && payload.last_updated ? payload.last_updated : null,
		credits: {
			usage,
			limit,
			percent,
		},
		storage: {
			bytes: asFiniteNumber(payload.storage?.usage),
			credits: asFiniteNumber(payload.storage?.credits_usage),
		},
		bandwidth: {
			bytes: asFiniteNumber(payload.bandwidth?.usage),
			credits: asFiniteNumber(payload.bandwidth?.credits_usage),
		},
		transformations: {
			count: asFiniteNumber(payload.transformations?.usage),
			credits: asFiniteNumber(payload.transformations?.credits_usage),
		},
		resources: asFiniteNumber(payload.resources) ?? asFiniteNumber(payload.objects?.usage),
	};
}

/** Parse and validate a percentage threshold (0..100). */
export function parsePercentageOption(raw, flagName) {
	const text = String(raw ?? "").trim();
	if (!text) throw new Error(`${flagName} requires a numeric percentage`);
	const num = Number(text);
	if (!Number.isFinite(num) || num < 0 || num > 100) {
		throw new Error(`${flagName} must be a finite number between 0 and 100 (got "${text}")`);
	}
	return num;
}

/**
 * Evaluate credit usage against warn/fail percentage thresholds.
 */
export function evaluateUsageThreshold(report, { warnPct = DEFAULT_WARN_PCT, failPct = DEFAULT_FAIL_PCT } = {}) {
	if (!Number.isFinite(warnPct) || warnPct < 0 || warnPct > 100) {
		throw new Error(`Invalid warn threshold: ${warnPct}`);
	}
	if (!Number.isFinite(failPct) || failPct < 0 || failPct > 100) {
		throw new Error(`Invalid fail threshold: ${failPct}`);
	}
	if (warnPct > failPct) {
		throw new Error(`warn threshold (${warnPct}%) cannot exceed fail threshold (${failPct}%)`);
	}
	const percent = report.credits.percent;
	const summary = `${report.credits.usage.toFixed(2)} / ${report.credits.limit} credits (${percent.toFixed(2)}%)`;
	if (percent >= failPct) {
		return {
			status: "fail",
			warnPct,
			failPct,
			percent,
			message: `Cloudinary credit usage ${summary} reached fail threshold (>= ${failPct}%)`,
		};
	}
	if (percent >= warnPct) {
		return {
			status: "warn",
			warnPct,
			failPct,
			percent,
			message: `Cloudinary credit usage ${summary} reached warn threshold (>= ${warnPct}%)`,
		};
	}
	return {
		status: "ok",
		warnPct,
		failPct,
		percent,
		message: `Cloudinary credit usage ${summary} is within budget (warn >= ${warnPct}%, fail >= ${failPct}%)`,
	};
}

/** Format a byte count into a human-readable IEC unit. */
export function formatBytes(bytes) {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "n/a";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KiB", "MiB", "GiB", "TiB"];
	let value = bytes / 1024;
	let idx = 0;
	while (value >= 1024 && idx < units.length - 1) {
		value /= 1024;
		idx += 1;
	}
	return `${value.toFixed(2)} ${units[idx]}`;
}

/** Render a Markdown report suitable for $GITHUB_STEP_SUMMARY. */
export function formatUsageMarkdown(report, evaluation) {
	const statusLabel = evaluation.status === "fail" ? "FAIL" : evaluation.status === "warn" ? "WARN" : "OK";
	const storageCell = report.storage.bytes !== null
		? `${formatBytes(report.storage.bytes)}${report.storage.credits !== null ? ` (${report.storage.credits.toFixed(2)} credits)` : ""}`
		: "n/a";
	const bandwidthCell = report.bandwidth.bytes !== null
		? `${formatBytes(report.bandwidth.bytes)}${report.bandwidth.credits !== null ? ` (${report.bandwidth.credits.toFixed(2)} credits)` : ""}`
		: "n/a";
	const transformCell = report.transformations.count !== null
		? `${report.transformations.count.toLocaleString("en-US")}${report.transformations.credits !== null ? ` (${report.transformations.credits.toFixed(2)} credits)` : ""}`
		: "n/a";

	const lines = [
		`### Cloudinary Usage Guard (${statusLabel})`,
		"",
		"| Metric | Value |",
		"|---|---|",
		`| Plan | ${report.plan} |`,
		`| Credits | ${report.credits.usage.toFixed(2)} / ${report.credits.limit} (${report.credits.percent.toFixed(2)}%) |`,
		`| Thresholds | warn >= ${evaluation.warnPct}%, fail >= ${evaluation.failPct}% |`,
		`| Storage | ${storageCell} |`,
		`| Bandwidth | ${bandwidthCell} |`,
		`| Transformations | ${transformCell} |`,
	];
	if (report.resources !== null) {
		lines.push(`| Resources | ${report.resources.toLocaleString("en-US")} |`);
	}
	if (report.lastUpdated) {
		lines.push(`| Last updated | ${report.lastUpdated} |`);
	}
	lines.push("");
	return lines.join("\n");
}

/**
 * Fetch and parse Cloudinary Admin API `/v1_1/<cloud>/usage`.
 */
export async function fetchCloudinaryUsage({
	cloudName,
	apiKey,
	apiSecret,
	fetchImpl = fetch,
	apiBaseUrl = DEFAULT_API_BASE,
}) {
	const base = apiBaseUrl.replace(/\/+$/, "");
	const url = `${base}/v1_1/${encodeURIComponent(cloudName)}/usage`;
	let res;
	try {
		res = await fetchImpl(url, {
			method: "GET",
			headers: {
				Authorization: buildBasicAuthHeader(apiKey, apiSecret),
				Accept: "application/json",
			},
		});
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`Cloudinary usage request failed: ${reason}`);
	}
	if (!res.ok) {
		// Cloudinary explains auth failures in { error: { message } } (e.g. a restricted key without Admin API access).
		// Surface it for diagnosis, with the key and secret redacted in case the message echoes them.
		let detail = "";
		try {
			const body = await res.json();
			const msg = typeof body?.error?.message === "string" ? body.error.message : "";
			detail = msg.split(apiKey).join("<api_key>").split(apiSecret).join("<api_secret>").slice(0, 300);
		} catch {
			// body not JSON: status alone
		}
		throw new Error(`Cloudinary usage API returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
	}
	let data;
	try {
		data = await res.json();
	} catch {
		throw new Error("Cloudinary usage API returned invalid JSON");
	}
	return parseCloudinaryUsage(data);
}

/**
 * Execute the Cloudinary usage guard end-to-end with injectable I/O for tests.
 * Returns numeric exit code (0 = ok/warn, 1 = fail).
 */
export async function runCloudinaryUsage({
	env = process.env,
	fetchImpl = fetch,
	apiBaseUrl = DEFAULT_API_BASE,
	warnPct = DEFAULT_WARN_PCT,
	failPct = DEFAULT_FAIL_PCT,
	json = false,
	summaryPath = env.GITHUB_STEP_SUMMARY,
	stdout = (line) => console.log(line),
	stderr = (line) => console.error(line),
} = {}) {
	const creds = resolveCloudinaryCredentials(env);
	const report = await fetchCloudinaryUsage({
		...creds,
		fetchImpl,
		apiBaseUrl,
	});
	const evaluation = evaluateUsageThreshold(report, { warnPct, failPct });

	if (summaryPath) {
		appendFileSync(summaryPath, `${formatUsageMarkdown(report, evaluation)}\n`, "utf8");
	}

	if (json) {
		stdout(
			JSON.stringify(
				{
					status: evaluation.status,
					message: evaluation.message,
					thresholds: { warnPct: evaluation.warnPct, failPct: evaluation.failPct },
					...report,
				},
				null,
				2,
			),
		);
	} else {
		stdout(
			`cloudinary credits=${report.credits.usage.toFixed(2)}/${report.credits.limit} (${report.credits.percent.toFixed(2)}%), storage=${formatBytes(report.storage.bytes)}, bandwidth=${formatBytes(report.bandwidth.bytes)}`,
		);
		if (evaluation.status === "warn") {
			stdout(`::warning::${evaluation.message}`);
		} else if (evaluation.status === "fail") {
			stderr(`::error::${evaluation.message}`);
		}
	}

	return evaluation.status === "fail" ? 1 : 0;
}

export function printHelp(write = console.log) {
	write(
		[
			"Usage: node apps/web/scripts/guards/cloudinary-usage.mjs [options]",
			"",
			"Check Cloudinary free-tier credit usage via Admin API /v1_1/<cloud>/usage.",
			"Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
			"",
			"Options:",
			`  --warn-pct <n>   Warn when credit usage >= <n>% (default: ${DEFAULT_WARN_PCT} or CLOUDINARY_WARN_PCT)`,
			`  --fail-pct <n>   Fail when credit usage >= <n>% (default: ${DEFAULT_FAIL_PCT} or CLOUDINARY_FAIL_PCT)`,
			"  --json           Emit JSON output to stdout",
			"  -h, --help       Show this help message",
		].join("\n"),
	);
}

async function main() {
	const { values } = parseArgs({
		options: {
			"warn-pct": { type: "string" },
			"fail-pct": { type: "string" },
			json: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: false,
	});

	if (values.help) {
		printHelp();
		return 0;
	}

	const warnRaw = values["warn-pct"] ?? process.env.CLOUDINARY_WARN_PCT ?? String(DEFAULT_WARN_PCT);
	const failRaw = values["fail-pct"] ?? process.env.CLOUDINARY_FAIL_PCT ?? String(DEFAULT_FAIL_PCT);
	const warnPct = parsePercentageOption(warnRaw, "--warn-pct");
	const failPct = parsePercentageOption(failRaw, "--fail-pct");

	return runCloudinaryUsage({
		warnPct,
		failPct,
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
	main()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((err) => {
			console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
			process.exitCode = 1;
		});
}
