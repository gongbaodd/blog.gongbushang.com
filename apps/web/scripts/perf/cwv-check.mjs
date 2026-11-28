#!/usr/bin/env node
// Core Web Vitals & Lighthouse parity harness (QA-3 / GON-180).
// Zero external npm dependencies: compares Lighthouse v10-v12 or Playwright CWV JSON reports
// and optionally collects live metrics via Lighthouse CLI or Playwright PerformanceObserver.

import { execFile } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Representative route set covering all primary page archetypes on growgen.xyz. */
export const DEFAULT_ROUTES = [
	"/", // home
	"/2025/09/08/mermaid/", // blog post (code blocks + diagrams)
	"/fe/", // category listing
	"/tags/", // tag directory
	"/podcast/", // podcast index
	"/about/", // static about page
];

/** Default CWV / Lighthouse regression budgets (aligned with Google CWV "Good" thresholds). */
export const DEFAULT_BUDGETS = {
	maxScoreDrop: 5, // Performance score points (0-100)
	maxLcpRegressionMs: 250, // ms (pass if <= 250 ms OR <= 15%)
	maxLcpRegressionPct: 15, // %
	maxCls: 0.1, // Absolute CLS ceiling (CWV Good <= 0.10)
	maxClsRegression: null, // Optional relative CLS delta cap (disabled by default)
	maxTbtRegressionMs: 100, // ms
	maxInpRegressionMs: 100, // ms (checked when INP is present in both reports)
	maxFcpRegressionMs: 250, // ms (pass if <= 250 ms OR <= 15%)
	maxFcpRegressionPct: 15, // %
	maxTransferRegressionBytes: 102400, // 100 KiB (pass if <= 100 KiB OR <= 15%)
	maxTransferRegressionPct: 15, // %
};

const FLOAT_EPSILON = 1e-9;

function toFiniteNumber(value) {
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function roundTo(value, decimals = 2) {
	if (value === null || value === undefined || !Number.isFinite(value)) return null;
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function isFileLikeSegment(segment) {
	return /\.[a-z0-9]{1,8}$/i.test(segment);
}

/**
 * Normalize a route path or full URL into a canonical comparison key:
 * - extracts pathname from http(s) URLs
 * - collapses duplicate slashes and ensures leading `/`
 * - ensures trailing `/` on directory-style routes (`/about` -> `/about/`, `/` -> `/`)
 *   while preserving file-like paths (`/rss.xml`, `/404.html`).
 */
export function normalizeRoute(input) {
	if (!input || typeof input !== "string") return "/";
	let pathname = input.trim();
	if (!pathname) return "/";

	if (/^https?:\/\//i.test(pathname)) {
		try {
			pathname = new URL(pathname).pathname;
		} catch {
			// Fall through to string cleanup
		}
	}

	// Strip query and hash if a relative URL was supplied
	pathname = pathname.split(/[?#]/, 1)[0];
	if (!pathname.startsWith("/")) pathname = `/${pathname}`;
	pathname = pathname.replace(/\/+/g, "/");

	if (pathname === "/index.html") return "/";
	if (pathname.endsWith("/index.html")) {
		pathname = pathname.slice(0, -"index.html".length);
	}

	if (pathname !== "/" && !pathname.endsWith("/")) {
		const lastSeg = pathname.split("/").filter(Boolean).at(-1) ?? "";
		if (!isFileLikeSegment(lastSeg)) {
			pathname = `${pathname}/`;
		}
	}
	return pathname;
}

/** Convert a normalized route into a filesystem-safe slug for per-route JSON files. */
export function routeToSlug(route) {
	const norm = normalizeRoute(route);
	if (norm === "/") return "home";
	return norm
		.replace(/^\/+|\/+$/g, "")
		.split("/")
		.map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
		.join("__");
}

/** Infer a route path from a report filename when the JSON lacks a URL/route field. */
export function inferRouteFromFilename(filePath) {
	const stem = basename(filePath, extname(filePath))
		.replace(/\.report$/i, "")
		.replace(/[-_.]run\d+$/i, "")
		.replace(/-\d+$/, "");
	if (!stem || stem === "home" || stem === "index" || stem === "root") return "/";
	return normalizeRoute(`/${stem.split("__").join("/")}`);
}

/** Format byte count into human-readable string (B, KB, MB). */
export function formatBytes(bytes) {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "n/a";
	const sign = bytes < 0 ? "-" : "";
	const abs = Math.abs(bytes);
	if (abs < 1024) return `${sign}${Math.round(abs)} B`;
	if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
	return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

/** Compute the median of a non-empty array of finite numbers, or null if empty. */
export function median(values) {
	const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
	if (nums.length === 0) return null;
	const mid = Math.floor(nums.length / 2);
	return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** Detect whether an object is a Lighthouse LHR (v10 / v11 / v12) or `{ lhr }` wrapper. */
export function isLighthouseReport(data) {
	if (!data || typeof data !== "object" || Array.isArray(data)) return false;
	const lhr = data.lhr && typeof data.lhr === "object" ? data.lhr : data;
	return Boolean(
		lhr &&
			typeof lhr === "object" &&
			lhr.audits &&
			typeof lhr.audits === "object" &&
			(typeof lhr.lighthouseVersion === "string" ||
				(lhr.categories && typeof lhr.categories === "object" && "performance" in lhr.categories)),
	);
}

function extractLighthouseTransferBytes(audits) {
	const totalByteWeight = toFiniteNumber(audits["total-byte-weight"]?.numericValue);
	if (totalByteWeight !== null) return Math.round(totalByteWeight);

	const resourceItems = audits["resource-summary"]?.details?.items;
	if (Array.isArray(resourceItems)) {
		const totalRow = resourceItems.find((item) => item?.resourceType === "total");
		const totalTransfer = toFiniteNumber(totalRow?.transferSize);
		if (totalTransfer !== null) return Math.round(totalTransfer);
	}

	const networkItems = audits["network-requests"]?.details?.items;
	if (Array.isArray(networkItems) && networkItems.length > 0) {
		let sum = 0;
		let found = false;
		for (const item of networkItems) {
			const size = toFiniteNumber(item?.transferSize ?? item?.resourceSize);
			if (size !== null) {
				sum += size;
				found = true;
			}
		}
		if (found) return Math.round(sum);
	}

	return null;
}

/**
 * Parse a Lighthouse v10, v11, or v12 JSON report (or `{ lhr }` wrapper) into normalized CWV metrics.
 */
export function parseLighthouseReport(raw, fallbackRoute = "/") {
	const lhr = raw?.lhr && typeof raw.lhr === "object" ? raw.lhr : raw;
	if (!isLighthouseReport(lhr)) {
		throw new Error("Input is not a valid Lighthouse JSON report");
	}

	const audits = lhr.audits ?? {};
	const rawUrl =
		lhr.finalDisplayedUrl || lhr.finalUrl || lhr.mainDocumentUrl || lhr.requestedUrl || null;
	const route = rawUrl ? normalizeRoute(rawUrl) : normalizeRoute(fallbackRoute);

	const rawScore = toFiniteNumber(lhr.categories?.performance?.score);
	const performanceScore =
		rawScore === null ? null : roundTo(rawScore <= 1 ? rawScore * 100 : rawScore, 1);

	const lcpMs = roundTo(toFiniteNumber(audits["largest-contentful-paint"]?.numericValue), 1);
	const cls = roundTo(toFiniteNumber(audits["cumulative-layout-shift"]?.numericValue), 4);
	const tbtMs = roundTo(toFiniteNumber(audits["total-blocking-time"]?.numericValue), 1);
	const inpMs = roundTo(
		toFiniteNumber(
			audits["interaction-to-next-paint"]?.numericValue ??
				audits["experimental-interaction-to-next-paint"]?.numericValue,
		),
		1,
	);
	const fcpMs = roundTo(toFiniteNumber(audits["first-contentful-paint"]?.numericValue), 1);
	const transferBytes = extractLighthouseTransferBytes(audits);

	return {
		route,
		url: typeof rawUrl === "string" ? rawUrl : null,
		source: "lighthouse",
		lighthouseVersion: typeof lhr.lighthouseVersion === "string" ? lhr.lighthouseVersion : null,
		performanceScore,
		lcpMs,
		cls,
		tbtMs,
		inpMs,
		fcpMs,
		transferBytes,
	};
}

/**
 * Parse a single Playwright CWV JSON entry (flat or `{ metrics: { ... } }`) into normalized metrics.
 */
export function parsePlaywrightEntry(raw, fallbackRoute = "/") {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("Playwright CWV entry must be a JSON object");
	}

	const m = raw.metrics && typeof raw.metrics === "object" ? raw.metrics : raw;
	const rawRoute = raw.route ?? raw.path ?? raw.url ?? fallbackRoute;
	const route = normalizeRoute(typeof rawRoute === "string" ? rawRoute : fallbackRoute);

	const rawScore = toFiniteNumber(m.performanceScore ?? m.score ?? m.performance);
	const performanceScore =
		rawScore === null
			? null
			: roundTo(rawScore > 0 && rawScore <= 1 ? rawScore * 100 : rawScore, 1);

	const lcpMs = roundTo(toFiniteNumber(m.lcpMs ?? m.lcp ?? m.LCP), 1);
	const cls = roundTo(toFiniteNumber(m.cls ?? m.CLS), 4);
	const tbtMs = roundTo(toFiniteNumber(m.tbtMs ?? m.tbt ?? m.TBT), 1);
	const inpMs = roundTo(toFiniteNumber(m.inpMs ?? m.inp ?? m.INP), 1);
	const fcpMs = roundTo(toFiniteNumber(m.fcpMs ?? m.fcp ?? m.FCP), 1);
	const rawTransfer = toFiniteNumber(
		m.transferBytes ?? m.transferSize ?? m.totalTransferBytes ?? m.totalBytes,
	);
	const transferBytes = rawTransfer === null ? null : Math.round(rawTransfer);

	const hasAnyMetric = [performanceScore, lcpMs, cls, tbtMs, inpMs, fcpMs, transferBytes].some(
		(v) => v !== null,
	);
	if (!hasAnyMetric) {
		throw new Error(`CWV entry for route "${route}" contains no recognized metric fields`);
	}

	return {
		route,
		url: typeof raw.url === "string" ? raw.url : null,
		source: typeof raw.source === "string" ? raw.source : "playwright",
		lighthouseVersion: typeof raw.lighthouseVersion === "string" ? raw.lighthouseVersion : null,
		performanceScore,
		lcpMs,
		cls,
		tbtMs,
		inpMs,
		fcpMs,
		transferBytes,
	};
}

/**
 * Parse any supported CWV JSON payload:
 * - Lighthouse v10/v11/v12 LHR JSON (or `{ lhr }`)
 * - Array of Lighthouse LHRs or Playwright route entries
 * - Multi-route bundle `{ routes: [...] }` or `{ routes: { "/about/": {...} } }`
 * - Single Playwright CWV JSON object
 */
export function parseReportPayload(data, fallbackRoute = "/") {
	if (Array.isArray(data)) {
		return data.flatMap((item) => parseReportPayload(item, fallbackRoute));
	}
	if (!data || typeof data !== "object") {
		throw new Error("Report payload must be a JSON object or array");
	}

	if (isLighthouseReport(data)) {
		return [parseLighthouseReport(data, fallbackRoute)];
	}

	if (data.routes !== undefined) {
		const collector = typeof data.collector === "string" ? data.collector : undefined;
		if (Array.isArray(data.routes)) {
			return data.routes.flatMap((entry) => {
				if (isLighthouseReport(entry)) return [parseLighthouseReport(entry, fallbackRoute)];
				const withSource =
					collector && entry && typeof entry === "object" && !entry.source
						? { ...entry, source: collector }
						: entry;
				return [parsePlaywrightEntry(withSource, fallbackRoute)];
			});
		}
		if (data.routes && typeof data.routes === "object") {
			const results = [];
			for (const [routeKey, entry] of Object.entries(data.routes)) {
				if (isLighthouseReport(entry)) {
					results.push(parseLighthouseReport(entry, routeKey));
				} else {
					const withRoute =
						entry && typeof entry === "object"
							? {
									route: routeKey,
									...(collector && !entry.source ? { source: collector } : {}),
									...entry,
								}
							: entry;
					results.push(parsePlaywrightEntry(withRoute, routeKey));
				}
			}
			return results;
		}
	}

	return [parsePlaywrightEntry(data, fallbackRoute)];
}

/**
 * Group normalized route records by canonical route and take the median of each metric across runs.
 */
export function aggregateRuns(records) {
	const grouped = new Map();
	for (const rec of records) {
		const key = normalizeRoute(rec.route);
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push({ ...rec, route: key });
	}

	const aggregated = new Map();
	for (const [route, list] of grouped.entries()) {
		const first = list[0];
		const transferMed = median(list.map((r) => r.transferBytes));
		aggregated.set(route, {
			route,
			url: list.find((r) => r.url)?.url ?? null,
			source: first.source ?? "unknown",
			lighthouseVersion: list.find((r) => r.lighthouseVersion)?.lighthouseVersion ?? null,
			runs: list.length,
			performanceScore: roundTo(median(list.map((r) => r.performanceScore)), 1),
			lcpMs: roundTo(median(list.map((r) => r.lcpMs)), 1),
			cls: roundTo(median(list.map((r) => r.cls)), 4),
			tbtMs: roundTo(median(list.map((r) => r.tbtMs)), 1),
			inpMs: roundTo(median(list.map((r) => r.inpMs)), 1),
			fcpMs: roundTo(median(list.map((r) => r.fcpMs)), 1),
			transferBytes: transferMed === null ? null : Math.round(transferMed),
		});
	}
	return aggregated;
}

function collectJsonFiles(dirPath) {
	const out = [];
	const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	for (const entry of entries) {
		const full = join(dirPath, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectJsonFiles(full));
		} else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
			out.push(full);
		}
	}
	return out;
}

/**
 * Load reports from a single JSON file or a directory of JSON files.
 * Returns a Map<normalizedRoute, aggregatedMetrics>.
 */
export function loadReports(targetPath) {
	if (!targetPath) {
		throw new Error("Report path is required");
	}
	if (!existsSync(targetPath)) {
		throw new Error(`Report path does not exist: ${targetPath}`);
	}

	const stats = statSync(targetPath);
	const files = stats.isDirectory() ? collectJsonFiles(targetPath) : [targetPath];
	if (files.length === 0) {
		throw new Error(`No .json report files found in: ${targetPath}`);
	}

	// If a directory contains a top-level summary.json generated by --collect alongside per-route files,
	// prefer per-route files when present so multi-run files aren't double-counted.
	const filteredFiles =
		stats.isDirectory() && files.length > 1
			? files.filter((f) => {
					const name = basename(f).toLowerCase();
					return name !== "summary.json" && name !== "manifest.json";
				})
			: files;
	const toParse = filteredFiles.length > 0 ? filteredFiles : files;

	const records = [];
	for (const file of toParse) {
		let parsed;
		try {
			parsed = JSON.parse(readFileSync(file, "utf8"));
		} catch (err) {
			throw new Error(
				`Failed to parse JSON in ${file}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		const fallbackRoute = inferRouteFromFilename(file);
		records.push(...parseReportPayload(parsed, fallbackRoute));
	}

	if (records.length === 0) {
		throw new Error(`No valid CWV/Lighthouse route metrics found in: ${targetPath}`);
	}

	return aggregateRuns(records);
}

function buildMetricDelta(legacyVal, candidateVal, decimals = 1) {
	const delta =
		legacyVal !== null && candidateVal !== null ? roundTo(candidateVal - legacyVal, decimals) : null;
	const deltaPct =
		legacyVal !== null && candidateVal !== null && legacyVal > 0
			? roundTo(((candidateVal - legacyVal) / legacyVal) * 100, 1)
			: null;
	return { legacy: legacyVal, candidate: candidateVal, delta, deltaPct };
}

/**
 * Evaluate a single route's legacy vs candidate metrics against regression budgets.
 */
export function evaluateRouteComparison(
	route,
	legacy,
	candidate,
	budgets = DEFAULT_BUDGETS,
	{ allowMissingRoutes = false } = {},
) {
	const normRoute = normalizeRoute(route);
	const b = { ...DEFAULT_BUDGETS, ...budgets };
	const violations = [];

	if (!legacy || !candidate) {
		const where = !legacy && !candidate ? "both legacy and candidate" : !legacy ? "legacy" : "candidate";
		const msg = `Route ${normRoute} is missing in ${where}`;
		if (!allowMissingRoutes) {
			violations.push(msg);
		}
		return {
			route: normRoute,
			status: "missing",
			missingIn: !legacy && !candidate ? "both" : !legacy ? "legacy" : "candidate",
			legacy: legacy ?? null,
			candidate: candidate ?? null,
			deltas: null,
			violations,
			warnings: allowMissingRoutes ? [msg] : [],
		};
	}

	const deltas = {
		performanceScore: buildMetricDelta(legacy.performanceScore, candidate.performanceScore, 1),
		lcpMs: buildMetricDelta(legacy.lcpMs, candidate.lcpMs, 1),
		cls: buildMetricDelta(legacy.cls, candidate.cls, 4),
		tbtMs: buildMetricDelta(legacy.tbtMs, candidate.tbtMs, 1),
		inpMs: buildMetricDelta(legacy.inpMs, candidate.inpMs, 1),
		fcpMs: buildMetricDelta(legacy.fcpMs, candidate.fcpMs, 1),
		transferBytes: buildMetricDelta(legacy.transferBytes, candidate.transferBytes, 0),
	};

	// 1. Performance score drop (higher is better)
	if (deltas.performanceScore.delta !== null) {
		const drop = legacy.performanceScore - candidate.performanceScore;
		if (drop > b.maxScoreDrop + FLOAT_EPSILON) {
			violations.push(
				`${normRoute}: Performance score dropped by ${roundTo(drop, 1)} pts (${legacy.performanceScore} -> ${candidate.performanceScore}, budget <= ${b.maxScoreDrop} pts)`,
			);
		}
	}

	// 2. LCP regression (pass if delta <= maxLcpRegressionMs OR deltaPct <= maxLcpRegressionPct)
	if (deltas.lcpMs.delta !== null && deltas.lcpMs.delta > 0) {
		const allowedByPct = legacy.lcpMs > 0 ? legacy.lcpMs * (b.maxLcpRegressionPct / 100) : 0;
		const allowedMs = Math.max(b.maxLcpRegressionMs, allowedByPct);
		if (deltas.lcpMs.delta > allowedMs + FLOAT_EPSILON) {
			const pctText = deltas.lcpMs.deltaPct !== null ? ` / +${deltas.lcpMs.deltaPct}%` : "";
			violations.push(
				`${normRoute}: LCP regressed by +${deltas.lcpMs.delta} ms${pctText} (${legacy.lcpMs} ms -> ${candidate.lcpMs} ms, budget <= ${b.maxLcpRegressionMs} ms or ${b.maxLcpRegressionPct}%)`,
			);
		}
	}

	// 3. CLS absolute ceiling (CWV Good <= 0.10) + optional relative regression cap
	if (candidate.cls !== null && candidate.cls > b.maxCls + FLOAT_EPSILON) {
		violations.push(
			`${normRoute}: CLS ${candidate.cls} exceeds ceiling ${b.maxCls} (legacy ${legacy.cls ?? "n/a"})`,
		);
	} else if (
		b.maxClsRegression !== null &&
		b.maxClsRegression !== undefined &&
		deltas.cls.delta !== null &&
		deltas.cls.delta > b.maxClsRegression + FLOAT_EPSILON
	) {
		violations.push(
			`${normRoute}: CLS regressed by +${deltas.cls.delta} (${legacy.cls} -> ${candidate.cls}, budget <= ${b.maxClsRegression})`,
		);
	}

	// 4. TBT regression
	if (deltas.tbtMs.delta !== null && deltas.tbtMs.delta > b.maxTbtRegressionMs + FLOAT_EPSILON) {
		violations.push(
			`${normRoute}: TBT regressed by +${deltas.tbtMs.delta} ms (${legacy.tbtMs} ms -> ${candidate.tbtMs} ms, budget <= ${b.maxTbtRegressionMs} ms)`,
		);
	}

	// 5. INP regression (when reported by both sides)
	if (deltas.inpMs.delta !== null && deltas.inpMs.delta > b.maxInpRegressionMs + FLOAT_EPSILON) {
		violations.push(
			`${normRoute}: INP regressed by +${deltas.inpMs.delta} ms (${legacy.inpMs} ms -> ${candidate.inpMs} ms, budget <= ${b.maxInpRegressionMs} ms)`,
		);
	}

	// 6. FCP regression (pass if delta <= maxFcpRegressionMs OR deltaPct <= maxFcpRegressionPct)
	if (deltas.fcpMs.delta !== null && deltas.fcpMs.delta > 0) {
		const allowedByPct = legacy.fcpMs > 0 ? legacy.fcpMs * (b.maxFcpRegressionPct / 100) : 0;
		const allowedMs = Math.max(b.maxFcpRegressionMs, allowedByPct);
		if (deltas.fcpMs.delta > allowedMs + FLOAT_EPSILON) {
			const pctText = deltas.fcpMs.deltaPct !== null ? ` / +${deltas.fcpMs.deltaPct}%` : "";
			violations.push(
				`${normRoute}: FCP regressed by +${deltas.fcpMs.delta} ms${pctText} (${legacy.fcpMs} ms -> ${candidate.fcpMs} ms, budget <= ${b.maxFcpRegressionMs} ms or ${b.maxFcpRegressionPct}%)`,
			);
		}
	}

	// 7. Transfer size regression (pass if delta <= maxTransferRegressionBytes OR deltaPct <= maxTransferRegressionPct)
	if (deltas.transferBytes.delta !== null && deltas.transferBytes.delta > 0) {
		const allowedByPct =
			legacy.transferBytes > 0 ? legacy.transferBytes * (b.maxTransferRegressionPct / 100) : 0;
		const allowedBytes = Math.max(b.maxTransferRegressionBytes, allowedByPct);
		if (deltas.transferBytes.delta > allowedBytes + FLOAT_EPSILON) {
			const pctText =
				deltas.transferBytes.deltaPct !== null ? ` / +${deltas.transferBytes.deltaPct}%` : "";
			violations.push(
				`${normRoute}: Transfer size grew by +${formatBytes(deltas.transferBytes.delta)}${pctText} (${formatBytes(legacy.transferBytes)} -> ${formatBytes(candidate.transferBytes)}, budget <= ${formatBytes(b.maxTransferRegressionBytes)} or ${b.maxTransferRegressionPct}%)`,
			);
		}
	}

	return {
		route: normRoute,
		status: violations.length === 0 ? "pass" : "fail",
		missingIn: null,
		legacy,
		candidate,
		deltas,
		violations,
		warnings: [],
	};
}

function orderRoutes(routeSet) {
	const defaultOrder = new Map(DEFAULT_ROUTES.map((r, i) => [normalizeRoute(r), i]));
	return [...routeSet].sort((a, b) => {
		const ia = defaultOrder.has(a) ? defaultOrder.get(a) : Number.MAX_SAFE_INTEGER;
		const ib = defaultOrder.has(b) ? defaultOrder.get(b) : Number.MAX_SAFE_INTEGER;
		if (ia !== ib) return ia - ib;
		return a.localeCompare(b);
	});
}

/**
 * Compare legacy and candidate route metric maps against budgets.
 */
export function compareReports({
	legacyMap,
	candidateMap,
	routes,
	budgets = DEFAULT_BUDGETS,
	allowMissingRoutes = false,
	requireDefaultRoutes = false,
}) {
	const mergedBudgets = { ...DEFAULT_BUDGETS, ...budgets };
	let targetRoutes;
	if (routes && routes.length > 0) {
		targetRoutes = [...new Set(routes.map(normalizeRoute))];
	} else {
		const union = new Set([...legacyMap.keys(), ...candidateMap.keys()]);
		if (requireDefaultRoutes) {
			for (const r of DEFAULT_ROUTES) union.add(normalizeRoute(r));
		}
		targetRoutes = orderRoutes(union);
	}

	const routeResults = targetRoutes.map((route) =>
		evaluateRouteComparison(route, legacyMap.get(route) ?? null, candidateMap.get(route) ?? null, mergedBudgets, {
			allowMissingRoutes,
		}),
	);

	const violations = routeResults.flatMap((r) => r.violations);
	const warnings = routeResults.flatMap((r) => r.warnings);
	const passed = routeResults.filter((r) => r.status === "pass").length;
	const failed = routeResults.filter((r) => r.status === "fail").length;
	const missing = routeResults.filter((r) => r.status === "missing").length;

	return {
		ok: violations.length === 0,
		summary: {
			total: routeResults.length,
			passed,
			failed,
			missing,
			regressions: violations.length,
		},
		budgets: mergedBudgets,
		routes: routeResults,
		violations,
		warnings,
	};
}

function formatPairCell(legacyVal, candVal, { suffix = "", decimals = 0, isBytes = false, showPct = false } = {}) {
	if (legacyVal === null && candVal === null) return "n/a";
	const fmt = (v) => {
		if (v === null || v === undefined) return "n/a";
		if (isBytes) return formatBytes(v);
		return `${decimals > 0 ? v.toFixed(decimals) : Math.round(v)}${suffix}`;
	};
	if (legacyVal === null || candVal === null) {
		return `${fmt(legacyVal)} -> ${fmt(candVal)}`;
	}
	const diff = candVal - legacyVal;
	const sign = diff > 0 ? "+" : "";
	let deltaStr;
	if (isBytes) {
		deltaStr = `${sign}${formatBytes(diff)}`;
	} else {
		deltaStr = `${sign}${decimals > 0 ? diff.toFixed(decimals) : Math.round(diff)}${suffix}`;
	}
	if (showPct && legacyVal > 0) {
		const pct = ((diff / legacyVal) * 100).toFixed(1);
		deltaStr += ` / ${diff > 0 ? "+" : ""}${pct}%`;
	}
	return `${fmt(legacyVal)} -> ${fmt(candVal)} (${deltaStr})`;
}

/**
 * Format a comparison report as a crisp GitHub-flavored Markdown summary table.
 */
export function formatMarkdownReport(comparison, { title = "Core Web Vitals & Lighthouse Parity" } = {}) {
	const verdict = comparison.ok ? "PASS" : "FAIL";
	const b = comparison.budgets;
	const lines = [
		`### ${title} (${verdict})`,
		"",
		`Routes: **${comparison.summary.total}** total · **${comparison.summary.passed}** passed · **${comparison.summary.failed}** regressed · **${comparison.summary.missing}** missing`,
		"",
		"| Route | Status | Perf Score | LCP (ms) | CLS | TBT/INP (ms) | FCP (ms) | Transfer |",
		"|---|---|---:|---:|---:|---:|---:|---:|",
	];

	for (const r of comparison.routes) {
		const badge = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "MISSING";
		if (r.status === "missing") {
			const note = `missing in ${r.missingIn}`;
			lines.push(`| \`${r.route}\` | ${badge} (${note}) | n/a | n/a | n/a | n/a | n/a | n/a |`);
			continue;
		}
		const leg = r.legacy;
		const cand = r.candidate;
		const scoreCell = formatPairCell(leg.performanceScore, cand.performanceScore, { decimals: 0 });
		const lcpCell = formatPairCell(leg.lcpMs, cand.lcpMs, { decimals: 0, showPct: true });
		const clsCell = formatPairCell(leg.cls, cand.cls, { decimals: 3 });

		let tbtInpCell;
		if (leg.tbtMs !== null || cand.tbtMs !== null) {
			tbtInpCell = formatPairCell(leg.tbtMs, cand.tbtMs, { decimals: 0 });
			if (leg.inpMs !== null || cand.inpMs !== null) {
				tbtInpCell += ` / INP ${formatPairCell(leg.inpMs, cand.inpMs, { decimals: 0 })}`;
			}
		} else if (leg.inpMs !== null || cand.inpMs !== null) {
			tbtInpCell = `INP ${formatPairCell(leg.inpMs, cand.inpMs, { decimals: 0 })}`;
		} else {
			tbtInpCell = "n/a";
		}

		const fcpCell = formatPairCell(leg.fcpMs, cand.fcpMs, { decimals: 0, showPct: true });
		const transferCell = formatPairCell(leg.transferBytes, cand.transferBytes, {
			isBytes: true,
			showPct: true,
		});

		lines.push(
			`| \`${r.route}\` | ${badge} | ${scoreCell} | ${lcpCell} | ${clsCell} | ${tbtInpCell} | ${fcpCell} | ${transferCell} |`,
		);
	}

	lines.push("");
	lines.push(
		`Budgets: score drop <= ${b.maxScoreDrop} pts · LCP <= +${b.maxLcpRegressionMs} ms or +${b.maxLcpRegressionPct}% · CLS <= ${b.maxCls.toFixed(2)} · TBT <= +${b.maxTbtRegressionMs} ms · INP <= +${b.maxInpRegressionMs} ms · FCP <= +${b.maxFcpRegressionMs} ms or +${b.maxFcpRegressionPct}% · Transfer <= +${formatBytes(b.maxTransferRegressionBytes)} or +${b.maxTransferRegressionPct}%`,
	);

	if (comparison.violations.length > 0) {
		lines.push("");
		lines.push("#### Budget Violations");
		for (const v of comparison.violations) {
			lines.push(`- ${v}`);
		}
	}

	if (comparison.warnings && comparison.warnings.length > 0) {
		lines.push("");
		lines.push("#### Warnings");
		for (const w of comparison.warnings) {
			lines.push(`- ${w}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

async function resolveLighthouseCommand() {
	try {
		await execFileAsync("lighthouse", ["--version"], { timeout: 10000 });
		return { cmd: "lighthouse", prefixArgs: [] };
	} catch {
		try {
			await execFileAsync("npx", ["--no-install", "lighthouse", "--version"], { timeout: 15000 });
			return { cmd: "npx", prefixArgs: ["--no-install", "lighthouse"] };
		} catch {
			return null;
		}
	}
}

async function tryImportPlaywright() {
	try {
		return await import("playwright");
	} catch {
		// Also probe repo root node_modules when invoked from apps/web
		try {
			const req = createRequire(import.meta.url);
			const resolved = req.resolve("playwright", {
				paths: [process.cwd(), resolve(dirname(realpathSync(process.argv[1] || import.meta.url)), "../../../..")],
			});
			return await import(pathToFileURL(resolved).href);
		} catch {
			return null;
		}
	}
}

/**
 * Collect a single route via Lighthouse CLI (`lighthouse` or `npx lighthouse`).
 */
export async function collectRouteWithLighthouse({
	url,
	route,
	preset = "mobile",
	timeoutMs = 60000,
	command,
}) {
	const lhCmd = command ?? (await resolveLighthouseCommand()) ?? {
		cmd: "npx",
		prefixArgs: ["--yes", "lighthouse"],
	};
	const args = [
		...lhCmd.prefixArgs,
		url,
		"--output=json",
		"--output-path=stdout",
		"--only-categories=performance",
		"--quiet",
		"--chrome-flags=--headless=new --no-sandbox --disable-gpu",
	];
	if (preset === "desktop") {
		args.push("--preset=desktop");
	}
	const { stdout } = await execFileAsync(lhCmd.cmd, args, {
		timeout: timeoutMs,
		maxBuffer: 50 * 1024 * 1024,
	});
	const lhr = JSON.parse(stdout);
	return {
		raw: lhr,
		metrics: parseLighthouseReport(lhr, route),
	};
}

/**
 * Collect a single route via Playwright Chromium + PerformanceObserver (zero new deps).
 */
export async function collectRouteWithPlaywright({
	url,
	route,
	preset = "mobile",
	timeoutMs = 60000,
	playwrightModule,
}) {
	const pw = playwrightModule ?? (await tryImportPlaywright());
	if (!pw?.chromium) {
		throw new Error(
			"Playwright is not available. Install playwright or run with --collector lighthouse.",
		);
	}

	const browser = await pw.chromium.launch({ headless: true });
	try {
		const viewport = preset === "desktop" ? { width: 1350, height: 940 } : { width: 390, height: 844 };
		const context = await browser.newContext({
			viewport,
			isMobile: preset === "mobile",
		});
		const page = await context.newPage();

		await page.addInitScript(() => {
			window.__cwv = {
				lcpMs: null,
				fcpMs: null,
				cls: 0,
				tbtMs: 0,
				inpMs: null,
				_sessionValue: 0,
				_sessionEntries: [],
			};
			try {
				new PerformanceObserver((list) => {
					const entries = list.getEntries();
					const last = entries[entries.length - 1];
					if (last) window.__cwv.lcpMs = last.startTime;
				}).observe({ type: "largest-contentful-paint", buffered: true });
			} catch {}
			try {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.name === "first-contentful-paint") {
							window.__cwv.fcpMs = entry.startTime;
						}
					}
				}).observe({ type: "paint", buffered: true });
			} catch {}
			try {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.hadRecentInput) continue;
						const cwv = window.__cwv;
						const first = cwv._sessionEntries[0];
						const prev = cwv._sessionEntries[cwv._sessionEntries.length - 1];
						if (
							cwv._sessionValue &&
							prev &&
							first &&
							entry.startTime - prev.startTime < 1000 &&
							entry.startTime - first.startTime < 5000
						) {
							cwv._sessionValue += entry.value;
							cwv._sessionEntries.push(entry);
						} else {
							cwv._sessionValue = entry.value;
							cwv._sessionEntries = [entry];
						}
						if (cwv._sessionValue > cwv.cls) {
							cwv.cls = cwv._sessionValue;
						}
					}
				}).observe({ type: "layout-shift", buffered: true });
			} catch {}
			try {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.duration > 50) {
							window.__cwv.tbtMs += entry.duration - 50;
						}
					}
				}).observe({ type: "longtask", buffered: true });
			} catch {}
			try {
				new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.interactionId) {
							const prev = window.__cwv.inpMs ?? 0;
							if (entry.duration > prev) window.__cwv.inpMs = entry.duration;
						}
					}
				}).observe({ type: "event", durationThreshold: 16, buffered: true });
			} catch {}
		});

		try {
			await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
		} catch {
			await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
		}
		await page.waitForTimeout(500);

		const measured = await page.evaluate(() => {
			const cwv = window.__cwv ?? {};
			let transferBytes = 0;
			const navEntries = performance.getEntriesByType("navigation");
			for (const nav of navEntries) {
				transferBytes += nav.transferSize || nav.encodedBodySize || 0;
			}
			const resEntries = performance.getEntriesByType("resource");
			for (const res of resEntries) {
				transferBytes += res.transferSize || res.encodedBodySize || 0;
			}
			return {
				lcpMs: cwv.lcpMs,
				fcpMs: cwv.fcpMs,
				cls: cwv.cls,
				tbtMs: cwv.tbtMs,
				inpMs: cwv.inpMs,
				transferBytes,
			};
		});

		const entry = {
			route: normalizeRoute(route),
			url,
			source: "playwright",
			metrics: measured,
		};
		return {
			raw: entry,
			metrics: parsePlaywrightEntry(entry, route),
		};
	} finally {
		await browser.close();
	}
}

/**
 * Collect CWV / Lighthouse metrics across a list of routes from a target base URL.
 */
export async function collectMetrics({
	baseUrl,
	routes = DEFAULT_ROUTES,
	collector = "auto",
	runs = 1,
	preset = "mobile",
	timeoutMs = 60000,
	outPath,
	runners = {},
}) {
	if (!baseUrl) {
		throw new Error("--url <baseUrl> is required in --collect mode");
	}
	let parsedBase;
	try {
		parsedBase = new URL(baseUrl);
	} catch {
		throw new Error(`Invalid --url value: "${baseUrl}"`);
	}
	if (!Number.isInteger(runs) || runs < 1) {
		throw new Error(`--runs must be a positive integer (got ${runs})`);
	}

	let selectedCollector = collector;
	let lhCommand = null;
	if (selectedCollector === "auto") {
		if (runners.lighthouse) {
			selectedCollector = "lighthouse";
		} else if (runners.playwright) {
			selectedCollector = "playwright";
		} else {
			lhCommand = await resolveLighthouseCommand();
			if (lhCommand) {
				selectedCollector = "lighthouse";
			} else if (await tryImportPlaywright()) {
				selectedCollector = "playwright";
			} else {
				throw new Error(
					"Neither Lighthouse CLI (`lighthouse` / `npx --no-install lighthouse`) nor Playwright is available. Install Playwright browsers (`pnpm exec playwright install chromium`) or run with `--collector lighthouse` (which uses `npx --yes lighthouse`).",
				);
			}
		}
	}

	const runRoute =
		selectedCollector === "lighthouse"
			? (opts) =>
					runners.lighthouse
						? runners.lighthouse(opts)
						: collectRouteWithLighthouse({ ...opts, command: lhCommand })
			: selectedCollector === "playwright"
				? (opts) =>
						runners.playwright ? runners.playwright(opts) : collectRouteWithPlaywright(opts)
				: null;

	if (!runRoute) {
		throw new Error(`Unsupported --collector "${collector}" (expected auto, lighthouse, or playwright)`);
	}

	const normRoutes = [...new Set(routes.map(normalizeRoute))];
	const allRecords = [];
	const rawRuns = [];

	for (const route of normRoutes) {
		const targetUrl = new URL(route, parsedBase).toString();
		for (let i = 0; i < runs; i++) {
			const res = await runRoute({ url: targetUrl, route, preset, timeoutMs, runIndex: i });
			const payload = res?.raw ?? res;
			const metrics = res?.metrics ? res.metrics : parseReportPayload(payload, route)[0];
			allRecords.push(metrics);
			rawRuns.push({ route, runIndex: i, raw: payload, metrics });
		}
	}

	const aggregatedMap = aggregateRuns(allRecords);
	const report = {
		format: "cwv-report",
		version: 1,
		collector: selectedCollector,
		preset,
		runs,
		baseUrl: parsedBase.toString().replace(/\/+$/, ""),
		collectedAt: new Date().toISOString(),
		routes: [...aggregatedMap.values()],
	};

	if (outPath) {
		const resolvedOut = resolve(outPath);
		const isJsonFile = extname(resolvedOut).toLowerCase() === ".json";
		if (isJsonFile) {
			mkdirSync(dirname(resolvedOut), { recursive: true });
			writeFileSync(resolvedOut, `${JSON.stringify(report, null, 2)}\n`, "utf8");
		} else {
			mkdirSync(resolvedOut, { recursive: true });
			for (const item of rawRuns) {
				const slug = routeToSlug(item.route);
				const suffix = runs > 1 ? `-run${item.runIndex + 1}` : "";
				writeFileSync(
					join(resolvedOut, `${slug}${suffix}.json`),
					`${JSON.stringify(item.raw, null, 2)}\n`,
					"utf8",
				);
			}
			writeFileSync(
				join(resolvedOut, "summary.json"),
				`${JSON.stringify(report, null, 2)}\n`,
				"utf8",
			);
		}
	}

	return report;
}

function splitRouteArgs(values = []) {
	return values
		.flatMap((v) => String(v).split(","))
		.map((v) => v.trim())
		.filter(Boolean);
}

function parseNumericFlag(raw, flagName, { min = 0, integer = false } = {}) {
	const text = String(raw ?? "").trim();
	if (!text) throw new Error(`${flagName} requires a numeric value`);
	const num = Number(text);
	if (!Number.isFinite(num) || num < min || (integer && !Number.isInteger(num))) {
		throw new Error(
			`${flagName} must be a ${integer ? "valid integer" : "valid number"} >= ${min} (got "${text}")`,
		);
	}
	return num;
}

export function printHelp(write = console.log) {
	write(
		[
			"Usage:",
			"  Compare reports:",
			"    node apps/web/scripts/perf/cwv-check.mjs --legacy <dir-or-json> --candidate <dir-or-json> [options]",
			"",
			"  Collect live metrics:",
			"    node apps/web/scripts/perf/cwv-check.mjs --collect --url <base-url> [--out <dir-or-json>] [options]",
			"",
			"Compare Lighthouse v10/v11/v12 or Playwright Core Web Vitals JSON reports against regression budgets,",
			"or capture metrics from a live preview / staging URL using Lighthouse CLI or Playwright.",
			"",
			`Default routes (${DEFAULT_ROUTES.length}):`,
			`  ${DEFAULT_ROUTES.join(", ")}`,
			"",
			"Compare options:",
			"  --legacy <path>              Legacy baseline JSON file or directory of JSON reports",
			"  --candidate <path>           Candidate JSON file or directory of JSON reports",
			"  --routes <list>              Comma-separated routes to compare (repeatable)",
			"  --require-default-routes     Fail if any default representative route is missing",
			"  --allow-missing-routes       Warn instead of failing when a route is missing on one side",
			"",
			"Budget options:",
			`  --max-score-drop <pts>       Max Performance score drop in pts (default: ${DEFAULT_BUDGETS.maxScoreDrop})`,
			`  --max-lcp-ms <ms>            Max LCP regression absolute tolerance in ms (default: ${DEFAULT_BUDGETS.maxLcpRegressionMs})`,
			`  --max-lcp-pct <pct>          Max LCP regression percentage tolerance (default: ${DEFAULT_BUDGETS.maxLcpRegressionPct})`,
			`  --max-cls <n>                Max candidate CLS ceiling (default: ${DEFAULT_BUDGETS.maxCls.toFixed(2)})`,
			"  --max-cls-regression <n>     Optional max relative CLS increase (disabled by default)",
			`  --max-tbt-ms <ms>            Max TBT regression in ms (default: ${DEFAULT_BUDGETS.maxTbtRegressionMs})`,
			`  --max-inp-ms <ms>            Max INP regression in ms (default: ${DEFAULT_BUDGETS.maxInpRegressionMs})`,
			`  --max-fcp-ms <ms>            Max FCP regression absolute tolerance in ms (default: ${DEFAULT_BUDGETS.maxFcpRegressionMs})`,
			`  --max-fcp-pct <pct>          Max FCP regression percentage tolerance (default: ${DEFAULT_BUDGETS.maxFcpRegressionPct})`,
			`  --max-transfer-bytes <n>     Max transfer size growth in bytes (default: ${DEFAULT_BUDGETS.maxTransferRegressionBytes})`,
			`  --max-transfer-pct <pct>     Max transfer size growth percentage (default: ${DEFAULT_BUDGETS.maxTransferRegressionPct})`,
			"",
			"Collect options:",
			"  --collect                    Capture metrics from --url instead of comparing files",
			"  --url <base-url>             Target origin (e.g. http://127.0.0.1:4321 or https://growgen.xyz)",
			"  --out <path>                 Write output to a .json bundle file or a directory of per-route files",
			"  --collector <mode>           auto | lighthouse | playwright (default: auto)",
			"  --runs <n>                   Runs per route for median aggregation (default: 1)",
			"  --preset <mode>              mobile | desktop (default: mobile)",
			"  --timeout <ms>               Per-route collection timeout in ms (default: 60000)",
			"",
			"Output options:",
			"  --json                       Emit structured JSON to stdout",
			"  -h, --help                   Show this help message and exit 0",
			"",
			"Exit codes:",
			"  0  Pass (within budgets), collection succeeded, or --help",
			"  1  CWV regression detected, missing route, or collection error",
			"  2  Invalid CLI flags or unreadable input",
		].join("\n"),
	);
}

/**
 * Execute the CLI with injectable I/O and collectors for unit testing.
 */
export async function runCli(
	argv = process.argv.slice(2),
	{
		stdout = (line) => console.log(line),
		stderr = (line) => console.error(line),
		summaryPath = process.env.GITHUB_STEP_SUMMARY,
		runners = {},
	} = {},
) {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: false,
			options: {
				legacy: { type: "string" },
				candidate: { type: "string" },
				routes: { type: "string", multiple: true },
				"require-default-routes": { type: "boolean", default: false },
				"allow-missing-routes": { type: "boolean", default: false },
				"max-score-drop": { type: "string" },
				"max-lcp-ms": { type: "string" },
				"max-lcp-pct": { type: "string" },
				"max-cls": { type: "string" },
				"max-cls-regression": { type: "string" },
				"max-tbt-ms": { type: "string" },
				"max-inp-ms": { type: "string" },
				"max-fcp-ms": { type: "string" },
				"max-fcp-pct": { type: "string" },
				"max-transfer-bytes": { type: "string" },
				"max-transfer-pct": { type: "string" },
				collect: { type: "boolean", default: false },
				url: { type: "string" },
				out: { type: "string" },
				collector: { type: "string", default: "auto" },
				runs: { type: "string", default: "1" },
				preset: { type: "string", default: "mobile" },
				timeout: { type: "string", default: "60000" },
				json: { type: "boolean", default: false },
				help: { type: "boolean", short: "h", default: false },
			},
		});
	} catch (err) {
		stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
		stderr("Run with --help for usage.");
		return 2;
	}

	const { values } = parsed;
	if (values.help) {
		printHelp(stdout);
		return 0;
	}

	const routes = values.routes ? splitRouteArgs(values.routes) : undefined;

	if (values.collect) {
		if (!values.url) {
			stderr("Error: --collect requires --url <base-url>.");
			return 2;
		}
		if (values.preset !== "mobile" && values.preset !== "desktop") {
			stderr(`Error: --preset must be "mobile" or "desktop" (got "${values.preset}").`);
			return 2;
		}
		let runs;
		let timeoutMs;
		try {
			runs = parseNumericFlag(values.runs, "--runs", { min: 1, integer: true });
			timeoutMs = parseNumericFlag(values.timeout, "--timeout", { min: 1000, integer: true });
		} catch (err) {
			stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
			return 2;
		}

		try {
			const report = await collectMetrics({
				baseUrl: values.url,
				routes: routes ?? DEFAULT_ROUTES,
				collector: values.collector,
				runs,
				preset: values.preset,
				timeoutMs,
				outPath: values.out,
				runners,
			});
			if (values.json || !values.out) {
				stdout(JSON.stringify(report, null, 2));
			} else {
				stdout(
					`Collected ${report.routes.length} routes (${report.collector}, ${report.preset}, runs=${report.runs}) -> ${values.out}`,
				);
			}
			return 0;
		} catch (err) {
			stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
			return 1;
		}
	}

	if (!values.legacy || !values.candidate) {
		stderr("Error: both --legacy <path> and --candidate <path> are required (or use --collect --url <base-url>).");
		stderr("Run with --help for usage.");
		return 2;
	}

	const budgets = { ...DEFAULT_BUDGETS };
	try {
		if (values["max-score-drop"] !== undefined) {
			budgets.maxScoreDrop = parseNumericFlag(values["max-score-drop"], "--max-score-drop");
		}
		if (values["max-lcp-ms"] !== undefined) {
			budgets.maxLcpRegressionMs = parseNumericFlag(values["max-lcp-ms"], "--max-lcp-ms");
		}
		if (values["max-lcp-pct"] !== undefined) {
			budgets.maxLcpRegressionPct = parseNumericFlag(values["max-lcp-pct"], "--max-lcp-pct");
		}
		if (values["max-cls"] !== undefined) {
			budgets.maxCls = parseNumericFlag(values["max-cls"], "--max-cls");
		}
		if (values["max-cls-regression"] !== undefined) {
			budgets.maxClsRegression = parseNumericFlag(values["max-cls-regression"], "--max-cls-regression");
		}
		if (values["max-tbt-ms"] !== undefined) {
			budgets.maxTbtRegressionMs = parseNumericFlag(values["max-tbt-ms"], "--max-tbt-ms");
		}
		if (values["max-inp-ms"] !== undefined) {
			budgets.maxInpRegressionMs = parseNumericFlag(values["max-inp-ms"], "--max-inp-ms");
		}
		if (values["max-fcp-ms"] !== undefined) {
			budgets.maxFcpRegressionMs = parseNumericFlag(values["max-fcp-ms"], "--max-fcp-ms");
		}
		if (values["max-fcp-pct"] !== undefined) {
			budgets.maxFcpRegressionPct = parseNumericFlag(values["max-fcp-pct"], "--max-fcp-pct");
		}
		if (values["max-transfer-bytes"] !== undefined) {
			budgets.maxTransferRegressionBytes = parseNumericFlag(
				values["max-transfer-bytes"],
				"--max-transfer-bytes",
				{ integer: true },
			);
		}
		if (values["max-transfer-pct"] !== undefined) {
			budgets.maxTransferRegressionPct = parseNumericFlag(
				values["max-transfer-pct"],
				"--max-transfer-pct",
			);
		}
	} catch (err) {
		stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
		return 2;
	}

	let legacyMap;
	let candidateMap;
	try {
		legacyMap = loadReports(resolve(values.legacy));
		candidateMap = loadReports(resolve(values.candidate));
	} catch (err) {
		stderr(`Error: ${err instanceof Error ? err.message : String(err)}`);
		return 2;
	}

	const comparison = compareReports({
		legacyMap,
		candidateMap,
		routes,
		budgets,
		allowMissingRoutes: Boolean(values["allow-missing-routes"]),
		requireDefaultRoutes: Boolean(values["require-default-routes"]),
	});

	const markdown = formatMarkdownReport(comparison);
	if (summaryPath) {
		appendFileSync(summaryPath, `${markdown}\n`, "utf8");
	}

	if (values.json) {
		stdout(JSON.stringify(comparison, null, 2));
	} else {
		stdout(markdown);
	}

	return comparison.ok ? 0 : 1;
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
	runCli()
		.then((code) => {
			process.exitCode = code;
		})
		.catch((err) => {
			console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
			process.exitCode = 1;
		});
}
