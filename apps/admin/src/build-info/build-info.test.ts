import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { versionBlocks } from "./blocks.ts";
import { buildInfo, createPlugin, renderAdminRoute } from "./plugin.ts";
import { CACHE_TTL_MS, createVersionChecker, describeVersion, fetchLatestSha, FAILURE_TTL_MS, parseBuildSha, RUNS_URL, resolveVersionState } from "./version.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);
const runs = (sha: string) => new Response(JSON.stringify({ workflow_runs: [{ head_sha: sha }] }), { status: 200 });
const env = { BUILD_SHA: A, BUILD_TIME: "2026-11-28T10:00:00Z" };

describe("parseBuildSha", () => {
	it("accepts only a full hex sha", () => {
		expect(parseBuildSha(A.toUpperCase())).toBe(A);
		for (const v of [undefined, "", "unknown", "abc123", `${A}x`]) expect(parseBuildSha(v)).toBeUndefined();
	});
});

describe("fetchLatestSha", () => {
	it("asks for the last successful admin-image run on master", async () => {
		const f = vi.fn(async (_u: string, _i?: RequestInit) => runs(B));
		expect(await fetchLatestSha(f as unknown as typeof fetch)).toEqual({ ok: true, sha: B });
		expect(f.mock.calls[0][0]).toBe(RUNS_URL);
		expect(RUNS_URL).toContain("admin-image.yml/runs?branch=master&status=success&per_page=1");
	});
	it("sends the optional token only when given", async () => {
		const f = vi.fn(async (_u: string, _i: RequestInit) => runs(B));
		await fetchLatestSha(f as unknown as typeof fetch);
		await fetchLatestSha(f as unknown as typeof fetch, "tok");
		expect((f.mock.calls[0][1].headers as Record<string, string>).Authorization).toBeUndefined();
		expect((f.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
	});
	it("reports rate limits, HTTP errors, network errors and empty answers", async () => {
		const r = (res: () => Response | Promise<Response>) => fetchLatestSha((async () => res()) as unknown as typeof fetch);
		expect(await r(() => new Response("", { status: 403 }))).toMatchObject({ ok: false, reason: expect.stringContaining("rate limit") });
		expect(await r(() => new Response("", { status: 429 }))).toMatchObject({ ok: false, reason: expect.stringContaining("rate limit") });
		expect(await r(() => new Response("", { status: 500 }))).toEqual({ ok: false, reason: "GitHub answered 500" });
		expect(await r(() => Promise.reject(new TypeError("fetch failed")))).toEqual({ ok: false, reason: "GitHub is unreachable" });
		expect(await r(() => new Response(JSON.stringify({ workflow_runs: [] })))).toMatchObject({ ok: false });
		expect(await r(() => new Response("not json"))).toMatchObject({ ok: false });
	});
});

describe("resolveVersionState", () => {
	it("is a dev build without a sha, whatever the lookup says", () => {
		expect(resolveVersionState({}, { ok: true, sha: A })).toEqual({ status: "dev" });
		expect(resolveVersionState({ BUILD_SHA: "unknown" }, undefined)).toEqual({ status: "dev" });
	});
	it("is up to date only when the shas match", () => {
		expect(resolveVersionState(env, { ok: true, sha: A }).status).toBe("up-to-date");
		expect(resolveVersionState(env, { ok: true, sha: B })).toMatchObject({ status: "outdated", latest: B });
	});
	it("never says up to date when the check failed", () => {
		expect(resolveVersionState(env, { ok: false, reason: "boom" })).toMatchObject({ status: "unknown", reason: "boom" });
		expect(resolveVersionState(env, undefined).status).toBe("unknown");
	});
});

describe("describeVersion", () => {
	it("uses the agreed wording", () => {
		expect(describeVersion({ status: "up-to-date", running: A }).headline).toBe("Up to date");
		expect(describeVersion({ status: "outdated", running: A, latest: B }).headline).toBe("A newer admin image is available (sha-bbbbbbb), redeploy on Altare");
		expect(describeVersion({ status: "unknown", running: A, reason: "GitHub is unreachable" }).headline).toBe("Couldn't check for the latest version (GitHub is unreachable)");
		expect(describeVersion({ status: "dev" }).headline).toBe("dev build");
	});
});

describe("createVersionChecker cache", () => {
	it("hits GitHub once within the TTL and again after it", async () => {
		const f = vi.fn(async () => runs(A));
		const check = createVersionChecker(f as unknown as typeof fetch);
		expect((await check(env, 0)).status).toBe("up-to-date");
		await check(env, CACHE_TTL_MS - 1);
		expect(f).toHaveBeenCalledTimes(1);
		await check(env, CACHE_TTL_MS);
		expect(f).toHaveBeenCalledTimes(2);
	});
	it("shares one request between concurrent callers", async () => {
		const f = vi.fn(async () => runs(A));
		const check = createVersionChecker(f as unknown as typeof fetch);
		await Promise.all([check(env, 0), check(env, 0), check(env, 0)]);
		expect(f).toHaveBeenCalledTimes(1);
	});
	it("retries a failure sooner than a success", async () => {
		const f = vi.fn(async () => new Response("", { status: 403 }));
		const check = createVersionChecker(f as unknown as typeof fetch);
		expect((await check(env, 0)).status).toBe("unknown");
		await check(env, FAILURE_TTL_MS - 1);
		expect(f).toHaveBeenCalledTimes(1);
		await check(env, FAILURE_TTL_MS);
		expect(f).toHaveBeenCalledTimes(2);
	});
	it("does not call GitHub for a dev build", async () => {
		const f = vi.fn();
		expect(await createVersionChecker(f as unknown as typeof fetch)({}, 0)).toEqual({ status: "dev" });
		expect(f).not.toHaveBeenCalled();
	});
});

describe("plugin", () => {
	const check = createVersionChecker((async () => runs(B)) as unknown as typeof fetch);
	const text = (r: { blocks: unknown[] }) => JSON.stringify(r);

	it("renders the widget without the page header, the page with it", async () => {
		const widget = await renderAdminRoute({ page: "widget:build" }, check, { BUILD_SHA: A });
		const page = await renderAdminRoute({ type: "page_load", page: "/build" }, check, { BUILD_SHA: A });
		expect(text(widget)).toContain("A newer admin image is available (sha-bbbbbbb)");
		expect(text(widget)).not.toContain("Admin build");
		expect(text(page)).toContain("Admin build");
		expect(text(page)).toContain(`Commit ${A}`);
	});
	it("shows only the commit, never the lookup token", async () => {
		const out = text(await renderAdminRoute({ page: "widget:build" }, check, { BUILD_SHA: A, ADMIN_VERSION_CHECK_TOKEN: "s3cret" }));
		expect(out).not.toContain("s3cret");
	});
	it("declares a widget, a page and an admin route, and no public route", () => {
		const d = buildInfo();
		expect(d.adminWidgets).toHaveLength(1);
		expect(d.adminPages).toHaveLength(1);
		expect(Object.keys(createPlugin().routes ?? {})).toEqual(["admin"]);
	});
	it("renders dev builds without a commit line", () => {
		expect(text(versionBlocks({ status: "dev" }, "page"))).not.toContain("Commit");
	});
});

describe("image wiring", () => {
	const root = new URL("../../../../", import.meta.url);
	it("bakes the commit in through the workflow and the Dockerfile", () => {
		const wf = readFileSync(new URL(".github/workflows/admin-image.yml", root), "utf8");
		const df = readFileSync(new URL("apps/admin/Dockerfile", root), "utf8");
		expect(wf).toContain("BUILD_SHA=${{ github.sha }}");
		expect(df).toMatch(/ARG BUILD_SHA/);
		expect(df).toMatch(/BUILD_SHA=\$\{BUILD_SHA\}/);
	});
	it("leaves /healthz at the minimal body", async () => {
		const { buildHealthzResponse } = await import("../pages/healthz.ts");
		expect(await buildHealthzResponse().json()).toEqual({ ok: true });
	});
});
