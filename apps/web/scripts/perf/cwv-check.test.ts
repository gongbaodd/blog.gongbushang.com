import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain .mjs perf harness module
import {
	aggregateRuns,
	collectMetrics,
	compareReports,
	DEFAULT_BUDGETS,
	DEFAULT_ROUTES,
	evaluateRouteComparison,
	formatBytes,
	formatMarkdownReport,
	inferRouteFromFilename,
	isLighthouseReport,
	loadReports,
	median,
	normalizeRoute,
	parseLighthouseReport,
	parsePlaywrightEntry,
	parseReportPayload,
	routeToSlug,
	runCli,
} from "./cwv-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(here, "cwv-check.mjs");

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

function makeLighthouseV10(overrides: Record<string, unknown> = {}) {
	return {
		lighthouseVersion: "10.4.0",
		requestedUrl: "https://growgen.xyz/about/",
		finalUrl: "https://growgen.xyz/about/",
		categories: {
			performance: { id: "performance", score: 0.96 },
		},
		audits: {
			"largest-contentful-paint": { numericValue: 1420 },
			"cumulative-layout-shift": { numericValue: 0.012 },
			"total-blocking-time": { numericValue: 45 },
			"first-contentful-paint": { numericValue: 780 },
			"total-byte-weight": { numericValue: 412000 },
		},
		...overrides,
	};
}

function makeLighthouseV11(overrides: Record<string, unknown> = {}) {
	return {
		lighthouseVersion: "11.7.1",
		requestedUrl: "https://growgen.xyz/fe/2025/09/08/mermaid/",
		mainDocumentUrl: "https://growgen.xyz/fe/2025/09/08/mermaid/",
		finalDisplayedUrl: "https://growgen.xyz/fe/2025/09/08/mermaid/",
		categories: {
			performance: { id: "performance", score: 0.91 },
		},
		audits: {
			"largest-contentful-paint": { numericValue: 1850 },
			"cumulative-layout-shift": { numericValue: 0.03 },
			"total-blocking-time": { numericValue: 110 },
			"first-contentful-paint": { numericValue: 920 },
			"total-byte-weight": { numericValue: 534000 },
		},
		...overrides,
	};
}

function makeLighthouseV12(overrides: Record<string, unknown> = {}) {
	return {
		lighthouseVersion: "12.2.1",
		finalDisplayedUrl: "https://growgen.xyz/",
		categories: {
			performance: { id: "performance", score: 0.89 },
		},
		audits: {
			"largest-contentful-paint": { numericValue: 2100 },
			"cumulative-layout-shift": { numericValue: 0.045 },
			"total-blocking-time": { numericValue: 140 },
			"interaction-to-next-paint": { numericValue: 92 },
			"first-contentful-paint": { numericValue: 1050 },
			// Omit total-byte-weight to verify network-requests fallback
			"network-requests": {
				details: {
					items: [
						{ url: "https://growgen.xyz/", transferSize: 45000 },
						{ url: "https://growgen.xyz/_astro/app.js", transferSize: 220000 },
						{ url: "https://growgen.xyz/_astro/app.css", transferSize: 68000 },
					],
				},
			},
		},
		...overrides,
	};
}

function makeMetricRecord(route: string, overrides: Record<string, unknown> = {}) {
	return {
		route,
		url: `https://growgen.xyz${route}`,
		source: "lighthouse",
		lighthouseVersion: "12.0.0",
		runs: 1,
		performanceScore: 95,
		lcpMs: 1400,
		cls: 0.02,
		tbtMs: 50,
		inpMs: null,
		fcpMs: 800,
		transferBytes: 400000,
		...overrides,
	};
}

describe("cwv-check helpers and normalization", () => {
	it("normalizes full URLs, bare paths, index.html, and file paths consistently", () => {
		expect(normalizeRoute("/")).toBe("/");
		expect(normalizeRoute("/index.html")).toBe("/");
		expect(normalizeRoute("about")).toBe("/about/");
		expect(normalizeRoute("/about")).toBe("/about/");
		expect(normalizeRoute("/about/")).toBe("/about/");
		expect(normalizeRoute("https://growgen.xyz/fe/2025/09/08/mermaid?utm=1#top")).toBe(
			"/fe/2025/09/08/mermaid/",
		);
		expect(normalizeRoute("/rss.xml")).toBe("/rss.xml");
		expect(normalizeRoute("/fe//tags/index.html")).toBe("/fe/tags/");
	});

	it("maps routes to filesystem slugs and infers routes back from filenames", () => {
		expect(routeToSlug("/")).toBe("home");
		expect(routeToSlug("/fe/2025/09/08/mermaid/")).toBe("fe__2025__09__08__mermaid");
		expect(inferRouteFromFilename("/tmp/home.json")).toBe("/");
		expect(inferRouteFromFilename("/tmp/about-run2.json")).toBe("/about/");
		expect(inferRouteFromFilename("/tmp/fe__2025__09__08__mermaid.report.json")).toBe(
			"/fe/2025/09/08/mermaid/",
		);
	});

	it("computes medians and formats byte sizes cleanly", () => {
		expect(median([300, 100, 200])).toBe(200);
		expect(median([100, 200, 300, 400])).toBe(250);
		expect(median([null, undefined])).toBeNull();
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(102400)).toBe("100.0 KB");
		expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.50 MB");
		expect(formatBytes(null)).toBe("n/a");
	});

	it("includes all 6 representative default route archetypes", () => {
		expect(DEFAULT_ROUTES).toContain("/");
		expect(DEFAULT_ROUTES).toContain("/fe/");
		expect(DEFAULT_ROUTES).toContain("/tags/");
		expect(DEFAULT_ROUTES).toContain("/podcast/");
		expect(DEFAULT_ROUTES).toContain("/about/");
		expect(DEFAULT_ROUTES.some((r: string) => /^\/\d{4}\/\d{2}\/\d{2}\/.+\/$/.test(r))).toBe(true);
		expect(DEFAULT_ROUTES).toHaveLength(6);
	});
});

describe("report parsing (Lighthouse v10/v11/v12 + Playwright CWV JSON)", () => {
	it("parses Lighthouse v10, v11, and v12 LHR JSON including transfer size fallbacks and INP", () => {
		const v10 = parseLighthouseReport(makeLighthouseV10());
		expect(isLighthouseReport(makeLighthouseV10())).toBe(true);
		expect(v10).toEqual({
			route: "/about/",
			url: "https://growgen.xyz/about/",
			source: "lighthouse",
			lighthouseVersion: "10.4.0",
			performanceScore: 96,
			lcpMs: 1420,
			cls: 0.012,
			tbtMs: 45,
			inpMs: null,
			fcpMs: 780,
			transferBytes: 412000,
		});

		const v11 = parseLighthouseReport({ lhr: makeLighthouseV11() });
		expect(v11.route).toBe("/fe/2025/09/08/mermaid/");
		expect(v11.lighthouseVersion).toBe("11.7.1");
		expect(v11.performanceScore).toBe(91);
		expect(v11.lcpMs).toBe(1850);
		expect(v11.transferBytes).toBe(534000);

		const v12 = parseLighthouseReport(makeLighthouseV12());
		expect(v12.route).toBe("/");
		expect(v12.lighthouseVersion).toBe("12.2.1");
		expect(v12.performanceScore).toBe(89);
		expect(v12.inpMs).toBe(92);
		expect(v12.transferBytes).toBe(45000 + 220000 + 68000);

		// Fallback via resource-summary total row
		const v12ResourceSummary = parseLighthouseReport({
			lighthouseVersion: "12.0.0",
			finalDisplayedUrl: "https://growgen.xyz/tags/",
			categories: { performance: { score: 0.94 } },
			audits: {
				"largest-contentful-paint": { numericValue: 1300 },
				"cumulative-layout-shift": { numericValue: 0.01 },
				"total-blocking-time": { numericValue: 30 },
				"first-contentful-paint": { numericValue: 650 },
				"resource-summary": {
					details: {
						items: [
							{ resourceType: "script", transferSize: 120000 },
							{ resourceType: "total", transferSize: 310000 },
						],
					},
				},
			},
		});
		expect(v12ResourceSummary.transferBytes).toBe(310000);
	});

	it("parses Playwright CWV JSON (flat, nested metrics, and multi-route cwv-report bundles)", () => {
		const nested = parsePlaywrightEntry({
			route: "/podcast/",
			url: "http://127.0.0.1:4321/podcast/",
			metrics: {
				lcpMs: 1280.4,
				cls: 0.015,
				tbtMs: 28,
				inpMs: 64,
				fcpMs: 610,
				transferBytes: 340500,
			},
		});
		expect(nested).toEqual({
			route: "/podcast/",
			url: "http://127.0.0.1:4321/podcast/",
			source: "playwright",
			lighthouseVersion: null,
			performanceScore: null,
			lcpMs: 1280.4,
			cls: 0.015,
			tbtMs: 28,
			inpMs: 64,
			fcpMs: 610,
			transferBytes: 340500,
		});

		const flat = parsePlaywrightEntry({
			path: "/tags",
			lcp: 1100,
			CLS: 0.004,
			fcp: 520,
			tbt: 15,
			transferSize: 290000,
		});
		expect(flat.route).toBe("/tags/");
		expect(flat.lcpMs).toBe(1100);
		expect(flat.cls).toBe(0.004);
		expect(flat.transferBytes).toBe(290000);

		const bundleRecords = parseReportPayload({
			format: "cwv-report",
			collector: "playwright",
			routes: {
				"/": { lcpMs: 1500, cls: 0.02, fcpMs: 700, tbtMs: 40, transferBytes: 510000 },
				"/about/": { metrics: { lcpMs: 900, cls: 0.0, fcpMs: 480, tbtMs: 10, transferBytes: 260000 } },
			},
		});
		expect(bundleRecords).toHaveLength(2);
		expect(bundleRecords[0].route).toBe("/");
		expect(bundleRecords[1].route).toBe("/about/");
		expect(bundleRecords[1].source).toBe("playwright");
	});

	it("loads directories with multiple runs per route and computes per-metric medians", () => {
		const dir = makeTempDir("cwv-dir-");
		writeFileSync(
			join(dir, "about-run1.json"),
			JSON.stringify(
				makeLighthouseV10({
					audits: {
						"largest-contentful-paint": { numericValue: 1200 },
						"cumulative-layout-shift": { numericValue: 0.01 },
						"total-blocking-time": { numericValue: 30 },
						"first-contentful-paint": { numericValue: 700 },
						"total-byte-weight": { numericValue: 400000 },
					},
				}),
			),
		);
		writeFileSync(
			join(dir, "about-run2.json"),
			JSON.stringify(
				makeLighthouseV10({
					audits: {
						"largest-contentful-paint": { numericValue: 2000 },
						"cumulative-layout-shift": { numericValue: 0.05 },
						"total-blocking-time": { numericValue: 90 },
						"first-contentful-paint": { numericValue: 950 },
						"total-byte-weight": { numericValue: 420000 },
					},
				}),
			),
		);
		writeFileSync(
			join(dir, "about-run3.json"),
			JSON.stringify(
				makeLighthouseV10({
					audits: {
						"largest-contentful-paint": { numericValue: 1450 },
						"cumulative-layout-shift": { numericValue: 0.02 },
						"total-blocking-time": { numericValue: 50 },
						"first-contentful-paint": { numericValue: 800 },
						"total-byte-weight": { numericValue: 410000 },
					},
				}),
			),
		);
		// summary.json alongside per-route files should be skipped to prevent double-counting
		writeFileSync(
			join(dir, "summary.json"),
			JSON.stringify({
				format: "cwv-report",
				routes: [{ route: "/about/", lcpMs: 9999, cls: 0.99 }],
			}),
		);

		const loaded = loadReports(dir);
		const about = loaded.get("/about/");
		expect(about).toBeDefined();
		expect(about.runs).toBe(3);
		expect(about.lcpMs).toBe(1450);
		expect(about.cls).toBe(0.02);
		expect(about.tbtMs).toBe(50);
		expect(about.fcpMs).toBe(800);
		expect(about.transferBytes).toBe(410000);
	});
});

describe("regression budgets and thresholds", () => {
	it("passes at exact budget boundaries", () => {
		const legacy = makeMetricRecord("/about/", {
			performanceScore: 95,
			lcpMs: 1000,
			cls: 0.01,
			tbtMs: 50,
			inpMs: 80,
			fcpMs: 800,
			transferBytes: 400000,
		});
		const candidate = makeMetricRecord("/about/", {
			performanceScore: 90, // exact -5 pts
			lcpMs: 1250, // exact +250 ms (>15%, but within 250 ms)
			cls: 0.1, // exact 0.10 ceiling
			tbtMs: 150, // exact +100 ms
			inpMs: 180, // exact +100 ms
			fcpMs: 1050, // exact +250 ms
			transferBytes: 502400, // exact +102400 bytes
		});

		const result = evaluateRouteComparison("/about/", legacy, candidate, DEFAULT_BUDGETS);
		expect(result.status).toBe("pass");
		expect(result.violations).toEqual([]);
	});

	it("applies LCP '250 ms OR 15%' tolerance accurately for both fast and slow routes", () => {
		// Fast route (legacy 800 ms): +200 ms is +25% (>15%) but <= 250 ms -> PASS
		const fastPass = evaluateRouteComparison(
			"/about/",
			makeMetricRecord("/about/", { lcpMs: 800 }),
			makeMetricRecord("/about/", { lcpMs: 1000 }),
		);
		expect(fastPass.status).toBe("pass");

		// Slow route (legacy 3000 ms): +400 ms (>250 ms) is +13.3% (<=15%) -> PASS
		const slowPass = evaluateRouteComparison(
			"/",
			makeMetricRecord("/", { lcpMs: 3000 }),
			makeMetricRecord("/", { lcpMs: 3400 }),
		);
		expect(slowPass.status).toBe("pass");

		// Slow route (legacy 3000 ms): +500 ms (>250 ms) AND +16.7% (>15%) -> FAIL
		const slowFail = evaluateRouteComparison(
			"/",
			makeMetricRecord("/", { lcpMs: 3000 }),
			makeMetricRecord("/", { lcpMs: 3500 }),
		);
		expect(slowFail.status).toBe("fail");
		expect(slowFail.violations[0]).toMatch(/LCP regressed by \+500 ms/);
	});

	it("flags score drop, CLS ceiling, TBT, INP, FCP, and transfer size regressions", () => {
		const legacy = makeMetricRecord("/fe/", {
			performanceScore: 94,
			lcpMs: 1500,
			cls: 0.02,
			tbtMs: 60,
			inpMs: 70,
			fcpMs: 700,
			transferBytes: 400000,
		});
		const candidate = makeMetricRecord("/fe/", {
			performanceScore: 88, // -6 pts > 5
			lcpMs: 1900, // +400 ms (+26.7%)
			cls: 0.14, // > 0.10
			tbtMs: 190, // +130 ms > 100
			inpMs: 210, // +140 ms > 100
			fcpMs: 1050, // +350 ms (+50%)
			transferBytes: 600000, // +200 KB (+50%)
		});

		const result = evaluateRouteComparison("/fe/", legacy, candidate);
		expect(result.status).toBe("fail");
		expect(result.violations).toHaveLength(7);
		expect(result.violations.join("\n")).toContain("Performance score dropped");
		expect(result.violations.join("\n")).toContain("LCP regressed");
		expect(result.violations.join("\n")).toContain("CLS 0.14 exceeds ceiling");
		expect(result.violations.join("\n")).toContain("TBT regressed");
		expect(result.violations.join("\n")).toContain("INP regressed");
		expect(result.violations.join("\n")).toContain("FCP regressed");
		expect(result.violations.join("\n")).toContain("Transfer size grew");
	});

	it("handles missing routes as failures by default and warnings with allowMissingRoutes", () => {
		const legacyMap = aggregateRuns([makeMetricRecord("/"), makeMetricRecord("/about/")]);
		const candidateMap = aggregateRuns([makeMetricRecord("/")]);

		const strict = compareReports({ legacyMap, candidateMap });
		expect(strict.ok).toBe(false);
		expect(strict.summary.missing).toBe(1);
		expect(strict.routes.find((r: { route: string }) => r.route === "/about/")?.missingIn).toBe(
			"candidate",
		);
		expect(strict.violations[0]).toMatch(/missing in candidate/);

		const lenient = compareReports({ legacyMap, candidateMap, allowMissingRoutes: true });
		expect(lenient.ok).toBe(true);
		expect(lenient.summary.missing).toBe(1);
		expect(lenient.warnings[0]).toMatch(/missing in candidate/);

		const explicitMissing = compareReports({
			legacyMap,
			candidateMap,
			routes: ["/", "/podcast/"],
		});
		expect(explicitMissing.ok).toBe(false);
		expect(explicitMissing.routes.find((r: { route: string }) => r.route === "/podcast/")?.missingIn).toBe(
			"both",
		);
	});
});

describe("markdown formatting", () => {
	it("renders a crisp Markdown table with deltas, n/a fallbacks, and violation list", () => {
		const legacyMap = aggregateRuns([
			makeMetricRecord("/", { performanceScore: 95, lcpMs: 1400, cls: 0.02, tbtMs: 40, transferBytes: 500000 }),
			makeMetricRecord("/about/", {
				source: "playwright",
				performanceScore: null,
				lcpMs: 900,
				cls: 0.01,
				tbtMs: null,
				inpMs: 60,
				fcpMs: 500,
				transferBytes: 250000,
			}),
		]);
		const candidateMap = aggregateRuns([
			makeMetricRecord("/", { performanceScore: 86, lcpMs: 1900, cls: 0.12, tbtMs: 210, transferBytes: 700000 }),
			makeMetricRecord("/about/", {
				source: "playwright",
				performanceScore: null,
				lcpMs: 950,
				cls: 0.02,
				tbtMs: null,
				inpMs: 75,
				fcpMs: 520,
				transferBytes: 245000,
			}),
		]);

		const comparison = compareReports({
			legacyMap,
			candidateMap,
			routes: ["/", "/about/", "/tags/"],
		});
		const md = formatMarkdownReport(comparison);

		expect(md).toContain("### Core Web Vitals & Lighthouse Parity (FAIL)");
		expect(md).toContain("| Route | Status | Perf Score | LCP (ms) | CLS | TBT/INP (ms) | FCP (ms) | Transfer |");
		expect(md).toContain("| `/` | FAIL | 95 -> 86 (-9) |");
		expect(md).toContain("| `/about/` | PASS | n/a | 900 -> 950 (+50 / +5.6%) | 0.010 -> 0.020 (+0.010) | INP 60 -> 75 (+15) |");
		expect(md).toContain("| `/tags/` | MISSING (missing in both) | n/a |");
		expect(md).toContain("#### Budget Violations");
	});
});

describe("CLI exit codes, --json, --collect, and --help", () => {
	it("returns exit code 0 on pass, 1 on regression, 2 on invalid args, and supports --json + step summary", async () => {
		const dir = makeTempDir("cwv-cli-");
		const legacyFile = join(dir, "legacy.json");
		const passFile = join(dir, "candidate-pass.json");
		const failFile = join(dir, "candidate-fail.json");
		const summaryFile = join(dir, "summary.md");

		writeFileSync(legacyFile, JSON.stringify(makeLighthouseV10()));
		writeFileSync(passFile, JSON.stringify(makeLighthouseV10({ categories: { performance: { score: 0.94 } } })));
		writeFileSync(
			failFile,
			JSON.stringify(
				makeLighthouseV10({
					categories: { performance: { score: 0.8 } },
					audits: {
						"largest-contentful-paint": { numericValue: 2200 },
						"cumulative-layout-shift": { numericValue: 0.15 },
						"total-blocking-time": { numericValue: 250 },
						"first-contentful-paint": { numericValue: 1300 },
						"total-byte-weight": { numericValue: 700000 },
					},
				}),
			),
		);

		const passOut: string[] = [];
		const passErr: string[] = [];
		const passCode = await runCli(["--legacy", legacyFile, "--candidate", passFile, "--json"], {
			stdout: (s: string) => passOut.push(s),
			stderr: (s: string) => passErr.push(s),
			summaryPath: summaryFile,
		});
		expect(passCode).toBe(0);
		expect(passErr).toEqual([]);
		const parsedPass = JSON.parse(passOut.join("\n"));
		expect(parsedPass.ok).toBe(true);
		expect(readFileSync(summaryFile, "utf8")).toContain("(PASS)");

		const failOut: string[] = [];
		const failCode = await runCli(["--legacy", legacyFile, "--candidate", failFile], {
			stdout: (s: string) => failOut.push(s),
			stderr: () => {},
			summaryPath: undefined,
		});
		expect(failCode).toBe(1);
		expect(failOut.join("\n")).toContain("(FAIL)");

		// Custom relaxed budgets can allow a controlled delta
		const relaxedCode = await runCli(
			[
				"--legacy",
				legacyFile,
				"--candidate",
				failFile,
				"--max-score-drop",
				"20",
				"--max-lcp-ms",
				"1000",
				"--max-cls",
				"0.20",
				"--max-tbt-ms",
				"300",
				"--max-fcp-ms",
				"600",
				"--max-transfer-bytes",
				"400000",
			],
			{ stdout: () => {}, stderr: () => {}, summaryPath: undefined },
		);
		expect(relaxedCode).toBe(0);

		// Missing flags -> exit code 2
		const invalidErr: string[] = [];
		const invalidCode = await runCli(["--legacy", legacyFile], {
			stdout: () => {},
			stderr: (s: string) => invalidErr.push(s),
			summaryPath: undefined,
		});
		expect(invalidCode).toBe(2);
		expect(invalidErr.join("\n")).toContain("--candidate");
	});

	it("supports --collect mode with mocked collector runner for both JSON bundle and directory outputs", async () => {
		const dir = makeTempDir("cwv-collect-");
		const outJson = join(dir, "bundle.json");
		const outDir = join(dir, "per-route");

		const mockPlaywright = vi.fn(async ({ url, route, runIndex }: { url: string; route: string; runIndex: number }) => ({
			raw: {
				route,
				url,
				source: "playwright",
				metrics: {
					lcpMs: 1000 + runIndex * 100,
					cls: 0.01,
					tbtMs: 20 + runIndex * 10,
					fcpMs: 500,
					transferBytes: 300000,
				},
			},
		}));

		const report = await collectMetrics({
			baseUrl: "http://127.0.0.1:4321",
			routes: ["/", "/about/"],
			collector: "playwright",
			runs: 3,
			outPath: outJson,
			runners: { playwright: mockPlaywright },
		});

		expect(mockPlaywright).toHaveBeenCalledTimes(6);
		expect(report.collector).toBe("playwright");
		expect(report.routes).toHaveLength(2);
		expect(report.routes[0].lcpMs).toBe(1100); // median of 1000, 1100, 1200

		const savedBundle = JSON.parse(readFileSync(outJson, "utf8"));
		expect(savedBundle.format).toBe("cwv-report");
		expect(savedBundle.routes).toHaveLength(2);

		// Also test CLI --collect writing to a directory and reloading with loadReports()
		const cliOut: string[] = [];
		const code = await runCli(
			[
				"--collect",
				"--url",
				"https://growgen.xyz",
				"--routes",
				"/,/about/",
				"--collector",
				"playwright",
				"--out",
				outDir,
			],
			{
				stdout: (s: string) => cliOut.push(s),
				stderr: () => {},
				summaryPath: undefined,
				runners: { playwright: mockPlaywright },
			},
		);
		expect(code).toBe(0);
		expect(cliOut.join("\n")).toContain("Collected 2 routes");

		const reloaded = loadReports(outDir);
		expect(reloaded.has("/")).toBe(true);
		expect(reloaded.has("/about/")).toBe(true);

		// --collect without --url -> exit code 2
		const missingUrlCode = await runCli(["--collect"], {
			stdout: () => {},
			stderr: () => {},
			summaryPath: undefined,
		});
		expect(missingUrlCode).toBe(2);
	});

	it("prints usage and exits 0 on --help (in-process and via node subprocess)", async () => {
		const out: string[] = [];
		const code = await runCli(["--help"], {
			stdout: (s: string) => out.push(s),
			stderr: () => {},
			summaryPath: undefined,
		});
		expect(code).toBe(0);
		expect(out.join("\n")).toContain("Usage:");
		expect(out.join("\n")).toContain("--legacy");
		expect(out.join("\n")).toContain("--collect");

		const stdout = execFileSync(process.execPath, [CLI_PATH, "--help"], {
			encoding: "utf8",
		});
		expect(stdout).toContain("Compare reports:");
		expect(stdout).toContain("--max-score-drop");
		expect(stdout).toContain("--max-cls");
	});
});
