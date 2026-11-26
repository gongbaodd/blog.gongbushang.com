import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain .mjs guard module
import {
	buildBasicAuthHeader,
	evaluateUsageThreshold,
	fetchCloudinaryUsage,
	formatBytes,
	formatUsageMarkdown,
	parseCloudinaryUsage,
	parsePercentageOption,
	resolveCloudinaryCredentials,
	runCloudinaryUsage,
} from "./cloudinary-usage.mjs";
// @ts-expect-error plain .mjs guard module
import {
	countStaticAssets,
	evaluateWorkerBudget,
	measureWorkerBundle,
	runWorkerBudget,
} from "./worker-budget.mjs";

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

const SAMPLE_USAGE_PAYLOAD = {
	plan: "Free",
	last_updated: "2026-11-25",
	credits: {
		usage: 4.43,
		limit: 25,
		used_percent: 17.72,
	},
	storage: {
		usage: 214748364,
		credits_usage: 0.2,
	},
	bandwidth: {
		usage: 1073741824,
		credits_usage: 1.0,
	},
	transformations: {
		usage: 3200,
		credits_usage: 3.2,
	},
	resources: 2500,
};

describe("cloudinary-usage", () => {
	it("resolves credentials and names missing env vars without leaking values", () => {
		const creds = resolveCloudinaryCredentials({
			CLOUDINARY_CLOUD_NAME: "growgen",
			CLOUDINARY_API_KEY: "key_123",
			CLOUDINARY_API_SECRET: "super_secret_value",
		});
		expect(creds).toEqual({
			cloudName: "growgen",
			apiKey: "key_123",
			apiSecret: "super_secret_value",
		});

		expect(() =>
			resolveCloudinaryCredentials({
				CLOUDINARY_CLOUD_NAME: "growgen",
				CLOUDINARY_API_KEY: "secret_key_never_print",
				CLOUDINARY_API_SECRET: "   ",
			}),
		).toThrow(/CLOUDINARY_API_SECRET/);

		try {
			resolveCloudinaryCredentials({
				CLOUDINARY_API_KEY: "secret_key_never_print",
			});
		} catch (err) {
			const msg = (err as Error).message;
			expect(msg).toContain("CLOUDINARY_CLOUD_NAME");
			expect(msg).toContain("CLOUDINARY_API_SECRET");
			expect(msg).not.toContain("secret_key_never_print");
		}
	});

	it("fetches Admin usage API with Basic Auth and parses credits/storage/bandwidth", async () => {
		const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
			expect(String(url)).toBe("https://api.cloudinary.com/v1_1/my-cloud/usage");
			expect(init?.method).toBe("GET");
			expect((init?.headers as Record<string, string>)?.Authorization).toBe(
				buildBasicAuthHeader("my-key", "my-secret"),
			);
			return new Response(JSON.stringify(SAMPLE_USAGE_PAYLOAD), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		});

		const report = await fetchCloudinaryUsage({
			cloudName: "my-cloud",
			apiKey: "my-key",
			apiSecret: "my-secret",
			fetchImpl: fetchMock as unknown as typeof fetch,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(report.plan).toBe("Free");
		expect(report.credits.usage).toBe(4.43);
		expect(report.credits.limit).toBe(25);
		expect(report.credits.percent).toBeCloseTo(17.72, 2);
		expect(report.storage).toEqual({ bytes: 214748364, credits: 0.2 });
		expect(report.bandwidth).toEqual({ bytes: 1073741824, credits: 1.0 });
		expect(report.transformations).toEqual({ count: 3200, credits: 3.2 });
		expect(report.resources).toBe(2500);
	});

	it("handles missing optional usage sections and HTTP/network errors without leaking secrets", async () => {
		const minimal = parseCloudinaryUsage({
			credits: { usage: 5, limit: 25 },
		});
		expect(minimal.credits.percent).toBe(20);
		expect(minimal.storage).toEqual({ bytes: null, credits: null });
		expect(minimal.bandwidth).toEqual({ bytes: null, credits: null });
		expect(minimal.plan).toBe("unknown");

		expect(() => parseCloudinaryUsage({})).toThrow(/credits\.usage/);

		const unauthorizedFetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
		await expect(
			fetchCloudinaryUsage({
				cloudName: "my-cloud",
				apiKey: "key-secret-value",
				apiSecret: "api-secret-value",
				fetchImpl: unauthorizedFetch as unknown as typeof fetch,
			}),
		).rejects.toSatisfy((err: Error) => {
			expect(err.message).toContain("HTTP 401");
			expect(err.message).not.toContain("key-secret-value");
			expect(err.message).not.toContain("api-secret-value");
			return true;
		});

		const forbiddenFetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ error: { message: "Key key-secret-value with secret api-secret-value is not allowed" } }),
					{ status: 403, headers: { "content-type": "application/json" } },
				),
		);
		await expect(
			fetchCloudinaryUsage({
				cloudName: "my-cloud",
				apiKey: "key-secret-value",
				apiSecret: "api-secret-value",
				fetchImpl: forbiddenFetch as unknown as typeof fetch,
			}),
		).rejects.toSatisfy((err: Error) => {
			expect(err.message).toContain("HTTP 403: Key <api_key> with secret <api_secret> is not allowed");
			expect(err.message).not.toContain("key-secret-value");
			expect(err.message).not.toContain("api-secret-value");
			return true;
		});

		const networkFailFetch = vi.fn(async () => {
			throw new Error("connect ECONNREFUSED");
		});
		await expect(
			fetchCloudinaryUsage({
				cloudName: "my-cloud",
				apiKey: "key-secret-value",
				apiSecret: "api-secret-value",
				fetchImpl: networkFailFetch as unknown as typeof fetch,
			}),
		).rejects.toThrow(/ECONNREFUSED/);
	});

	it("evaluates ok, warn (>= 75%), and fail (>= 90%) thresholds accurately", () => {
		const makeReport = (usage: number, limit = 100) =>
			parseCloudinaryUsage({ credits: { usage, limit } });

		expect(evaluateUsageThreshold(makeReport(74.9)).status).toBe("ok");
		expect(evaluateUsageThreshold(makeReport(75)).status).toBe("warn");
		expect(evaluateUsageThreshold(makeReport(89.9)).status).toBe("warn");
		expect(evaluateUsageThreshold(makeReport(90)).status).toBe("fail");
		expect(evaluateUsageThreshold(makeReport(98)).status).toBe("fail");

		expect(evaluateUsageThreshold(makeReport(55), { warnPct: 50, failPct: 80 }).status).toBe("warn");
		expect(evaluateUsageThreshold(makeReport(80), { warnPct: 50, failPct: 80 }).status).toBe("fail");

		expect(() => evaluateUsageThreshold(makeReport(10), { warnPct: 95, failPct: 90 })).toThrow(/exceed/);
		expect(() => parsePercentageOption("abc", "--warn-pct")).toThrow(/--warn-pct/);
		expect(() => parsePercentageOption("101", "--fail-pct")).toThrow(/--fail-pct/);
	});

	it("writes GITHUB_STEP_SUMMARY markdown and JSON output cleanly with correct exit codes", async () => {
		const dir = makeTempDir("guards-cld-");
		const summaryFile = join(dir, "step-summary.md");
		const env = {
			CLOUDINARY_CLOUD_NAME: "growgen",
			CLOUDINARY_API_KEY: "secret_api_key_123",
			CLOUDINARY_API_SECRET: "secret_api_secret_456",
		};

		const makeFetch = (usage: number) =>
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						...SAMPLE_USAGE_PAYLOAD,
						credits: { usage, limit: 25 },
					}),
					{ status: 200 },
				),
			) as unknown as typeof fetch;

		const stdoutOk: string[] = [];
		const stderrOk: string[] = [];
		const warnExit = await runCloudinaryUsage({
			env,
			fetchImpl: makeFetch(20), // 80% -> warn
			summaryPath: summaryFile,
			json: true,
			stdout: (s: string) => stdoutOk.push(s),
			stderr: (s: string) => stderrOk.push(s),
		});
		expect(warnExit).toBe(0);
		expect(stderrOk).toEqual([]);
		const parsed = JSON.parse(stdoutOk.join("\n"));
		expect(parsed.status).toBe("warn");
		expect(parsed.credits.percent).toBeCloseTo(80, 2);
		expect(stdoutOk.join("\n")).not.toContain("secret_api_key_123");
		expect(stdoutOk.join("\n")).not.toContain("secret_api_secret_456");

		const summaryText = readFileSync(summaryFile, "utf8");
		expect(summaryText).toContain("### Cloudinary Usage Guard (WARN)");
		expect(summaryText).toContain("20.00 / 25 (80.00%)");
		expect(summaryText).toContain(formatBytes(SAMPLE_USAGE_PAYLOAD.storage.usage));
		expect(summaryText).toContain(formatBytes(SAMPLE_USAGE_PAYLOAD.bandwidth.usage));

		const stdoutFail: string[] = [];
		const stderrFail: string[] = [];
		const failExit = await runCloudinaryUsage({
			env,
			fetchImpl: makeFetch(23), // 92% -> fail
			summaryPath: undefined,
			json: false,
			stdout: (s: string) => stdoutFail.push(s),
			stderr: (s: string) => stderrFail.push(s),
		});
		expect(failExit).toBe(1);
		expect(stderrFail[0]).toMatch(/^::error::/);
	});

	it("formats markdown summary with fallback n/a values", () => {
		const report = parseCloudinaryUsage({ credits: { usage: 1, limit: 25 } });
		const evaluation = evaluateUsageThreshold(report);
		const md = formatUsageMarkdown(report, evaluation);
		expect(md).toContain("Cloudinary Usage Guard (OK)");
		expect(md).toContain("| Storage | n/a |");
		expect(md).toContain("| Bandwidth | n/a |");
	});
});

describe("worker-budget", () => {
	it("sums only .js/.mjs/.wasm files recursively and counts all static assets recursively", () => {
		const root = makeTempDir("guards-worker-");
		const workerDir = join(root, "wrangler-dry");
		const assetsDir = join(root, "dist-client");
		mkdirSync(join(workerDir, "chunks"), { recursive: true });
		mkdirSync(join(assetsDir, "2026/11/25/hello"), { recursive: true });

		writeFileSync(join(workerDir, "index.js"), Buffer.alloc(1024));
		writeFileSync(join(workerDir, "chunks", "entry.mjs"), Buffer.alloc(2048));
		writeFileSync(join(workerDir, "chunks", "module.wasm"), Buffer.alloc(512));
		// Ignored files:
		writeFileSync(join(workerDir, "index.js.map"), Buffer.alloc(99999));
		writeFileSync(join(workerDir, "wrangler.json"), Buffer.alloc(5000));

		writeFileSync(join(assetsDir, "index.html"), "<html></html>");
		writeFileSync(join(assetsDir, "2026/11/25/hello", "index.html"), "<html>post</html>");
		writeFileSync(join(assetsDir, "2026/11/25/hello", "meta.json"), "{}");

		const bundle = measureWorkerBundle(workerDir);
		expect(bundle.bytes).toBe(1024 + 2048 + 512);
		expect(bundle.fileCount).toBe(3);
		expect(bundle.byExtension).toEqual({ ".js": 1024, ".mjs": 2048, ".wasm": 512 });

		const assets = countStaticAssets(assetsDir);
		// files only (wrangler skips directories); 4 dirs are reported for information
		expect(assets.count).toBe(3);
		expect(assets.files).toBe(3);
		expect(assets.dirs).toBe(4);
	});

	it("passes at exact budget boundaries and fails when either limit is exceeded", () => {
		const root = makeTempDir("guards-budget-");
		const workerDir = join(root, "worker");
		const assetsDir = join(root, "assets");
		mkdirSync(workerDir, { recursive: true });
		mkdirSync(assetsDir, { recursive: true });

		// 1 MiB exactly
		writeFileSync(join(workerDir, "bundle.mjs"), Buffer.alloc(1024 * 1024));
		writeFileSync(join(assetsDir, "a.html"), "a");
		writeFileSync(join(assetsDir, "b.html"), "b");

		const exact = evaluateWorkerBudget({ workerDir, assetsDir, maxMib: 1, maxAssets: 2 });
		expect(exact.ok).toBe(true);
		expect(exact.violations).toEqual([]);

		// Exceed worker size by 1 byte
		writeFileSync(join(workerDir, "extra.js"), Buffer.alloc(1));
		const tooBig = evaluateWorkerBudget({ workerDir, assetsDir, maxMib: 1, maxAssets: 2 });
		expect(tooBig.ok).toBe(false);
		expect(tooBig.violations).toHaveLength(1);
		expect(tooBig.violations[0]).toMatch(/exceeds budget 1 MiB/);

		// Exceed asset count too
		writeFileSync(join(assetsDir, "c.html"), "c");
		const bothExceeded = evaluateWorkerBudget({ workerDir, assetsDir, maxMib: 1, maxAssets: 2 });
		expect(bothExceeded.ok).toBe(false);
		expect(bothExceeded.violations).toHaveLength(2);
	});

	it("runs CLI helper cleanly with JSON output, summary, and error handling on missing dirs", () => {
		const root = makeTempDir("guards-budget-run-");
		const workerDir = join(root, "worker");
		const assetsDir = join(root, "assets");
		const summaryFile = join(root, "summary.md");
		mkdirSync(workerDir, { recursive: true });
		mkdirSync(assetsDir, { recursive: true });
		writeFileSync(join(workerDir, "worker.js"), Buffer.alloc(1024));
		writeFileSync(join(assetsDir, "index.html"), "ok");

		const out: string[] = [];
		const err: string[] = [];
		const code = runWorkerBudget({
			workerDir,
			assetsDir,
			maxMib: 60,
			maxAssets: 18000,
			json: true,
			summaryPath: summaryFile,
			stdout: (s: string) => out.push(s),
			stderr: (s: string) => err.push(s),
		});
		expect(code).toBe(0);
		expect(err).toEqual([]);
		const parsed = JSON.parse(out.join("\n"));
		expect(parsed.ok).toBe(true);
		expect(parsed.worker.bytes).toBe(1024);
		expect(parsed.assets.count).toBe(1);
		expect(readFileSync(summaryFile, "utf8")).toContain("Worker Free-Tier Budget (OK)");

		expect(() =>
			evaluateWorkerBudget({ workerDir: join(root, "does-not-exist"), assetsDir }),
		).toThrow(/does not exist/);
	});
});
