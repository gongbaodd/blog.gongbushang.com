import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dashboardPage, dashboardWidget } from "./blocks.ts";
import { DASHBOARD_CATEGORIES, LINK_REL, LINK_TARGET, resolveDashboards } from "./links.ts";
import { createPlugin, renderAdminRoute, serviceDashboards } from "./plugin.ts";

const REF = "abcdefghij0123456789";
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const env = { SUPABASE_PRODUCTION_REF: REF, CLOUDFLARE_ACCOUNT_ID: ACCOUNT };
const flat = (cats = resolveDashboards(env)) => cats.flatMap((c) => c.links);

describe("link structure", () => {
	it("has the expected categories, each non-empty", () => {
		expect(DASHBOARD_CATEGORIES.map((c) => c.id)).toEqual(["infrastructure", "media", "analytics", "project"]);
		for (const c of resolveDashboards(env)) expect(c.links.length).toBeGreaterThan(0);
	});

	it("gives every link a label, a purpose and an https URL", () => {
		for (const l of [...flat(), ...flat(resolveDashboards({}))]) {
			expect(l.label.length).toBeGreaterThan(0);
			expect(l.purpose.length).toBeGreaterThan(0);
			expect(new URL(l.url).protocol).toBe("https:");
		}
	});

	it("has no duplicate labels or URLs", () => {
		const links = flat();
		expect(new Set(links.map((l) => l.label)).size).toBe(links.length);
		expect(new Set(links.map((l) => l.url)).size).toBe(links.length);
	});

	it("has no testing links and no dropped colorize Worker", () => {
		const text = JSON.stringify(resolveDashboards(env)).toLowerCase();
		expect(text).not.toMatch(/testing|staging|growgen-testing/);
		expect(text).not.toContain("colorize");
	});

	it("declares the new-tab attributes", () => {
		expect(LINK_TARGET).toBe("_blank");
		expect(LINK_REL).toBe("noopener noreferrer");
	});
});

describe("environment-derived IDs", () => {
	const find = (cats: ReturnType<typeof resolveDashboards>, label: string) => flat(cats).find((l) => l.label === label)!.url;

	it("uses the IDs when set and well-formed", () => {
		expect(find(resolveDashboards(env), "Supabase")).toBe(`https://supabase.com/dashboard/project/${REF}`);
		expect(find(resolveDashboards(env), "Cloudflare: DNS")).toBe(`https://dash.cloudflare.com/${ACCOUNT}/home`);
	});

	it("falls back to generic dashboard URLs when unset or malformed", () => {
		for (const bad of [{}, { SUPABASE_PRODUCTION_REF: "../x?y", CLOUDFLARE_ACCOUNT_ID: "zz/../" }]) {
			const cats = resolveDashboards(bad);
			expect(find(cats, "Supabase")).toBe("https://supabase.com/dashboard/projects");
			expect(find(cats, "Cloudflare: DNS")).toBe("https://dash.cloudflare.com/");
		}
	});

	it("keeps the IDs out of the source files (public repo)", () => {
		const src = readFileSync(new URL("./links.ts", import.meta.url), "utf8");
		expect(src).not.toMatch(/[a-f0-9]{32}/);
		expect(src).not.toMatch(/ckpozotzgubrjbjstvjg/);
	});
});

describe("rendered output", () => {
	const SECRET = "s3cr3t-token-value";
	const secretEnv = { ...env, DATABASE_URL: `postgres://u:${SECRET}@h/db`, GITHUB_DISPATCH_TOKEN: SECRET, SUPABASE_SERVICE_ROLE_KEY: SECRET };

	it("renders external https link targets only", () => {
		const cats = resolveDashboards(env);
		for (const res of [dashboardPage(cats), dashboardWidget(cats)]) {
			expect(res.blocks.length).toBeGreaterThan(0);
			const links: { target: { kind: string; url: string } }[] = [];
			const walk = (n: unknown) => {
				if (Array.isArray(n)) n.forEach(walk);
				else if (n && typeof n === "object") {
					if ((n as { type?: string }).type === "link") links.push(n as never);
					Object.values(n).forEach(walk);
				}
			};
			walk(res);
			expect(links.length).toBe(flat(cats).length);
			for (const l of links) {
				expect(l.target.kind).toBe("external");
				expect(l.target.url.startsWith("https://")).toBe(true);
			}
		}
	});

	it("routes page loads to the page and widget loads to the widget", () => {
		expect(renderAdminRoute({ type: "page_load", page: "/dashboards" }, env).blocks[0]).toMatchObject({ type: "header" });
		expect(renderAdminRoute({ type: "page_load", page: "widget:dashboards" }, env).blocks[0]).toMatchObject({ type: "context" });
		expect(renderAdminRoute(undefined, env).blocks.length).toBeGreaterThan(0);
	});

	it("never leaks other environment values", () => {
		const out = JSON.stringify(renderAdminRoute({ page: "/dashboards" }, secretEnv));
		const out2 = JSON.stringify(renderAdminRoute({ page: "widget:dashboards" }, secretEnv));
		for (const s of [out, out2]) {
			expect(s).not.toContain(SECRET);
			expect(s).not.toMatch(/postgres(ql)?:\/\//);
			expect(s).not.toMatch(/token|password|secret|api[_-]?key/i);
		}
	});
});

describe("plugin registration", () => {
	it("declares one admin page and one widget on a native descriptor", () => {
		const d = serviceDashboards();
		expect(d.format).toBe("native");
		expect(d.adminPages).toHaveLength(1);
		expect(d.adminWidgets).toHaveLength(1);
		const plugin = createPlugin();
		expect(plugin.id).toBe(d.id);
		expect(plugin.admin.pages).toEqual(d.adminPages);
		expect(plugin.routes.admin).toBeDefined();
	});
});
