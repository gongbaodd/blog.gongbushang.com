import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dashboardPage, dashboardWidget } from "./blocks.ts";
import { DASHBOARD_CATEGORIES, LINK_REL, LINK_TARGET, resolveDashboards } from "./links.ts";
import { getTokenExpiryState, TOKEN_ROTATE_URL } from "./token-expiry.ts";
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

	it("never leaks other environment values, including when the expiry blocks render", () => {
		const CANARY = "canary-7f3a9c-do-not-render";
		const now = new Date("2027-10-27T12:00:00Z");
		const states = {
			"unset-production": { SITE_ENV: "production" },
			healthy: { SITE_ENV: "production", GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2028-06-01" },
			warning: { SITE_ENV: "production", GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2027-11-10" },
			expired: { SITE_ENV: "production", GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2027-10-01" },
		};
		// Exact strings the expiry blocks may legitimately contain; removed longest-first before the generic check.
		const allowed = [TOKEN_ROTATE_URL, "GITHUB_DISPATCH_TOKEN_EXPIRES_AT", "GITHUB_DISPATCH_TOKEN", "Rotate token"];
		const scrub = (s: string) => allowed.reduce((acc, a) => acc.replaceAll(a, ""), s);
		const generic = /token|password|secret|api[_-]?key/i;

		for (const [name, state] of Object.entries(states)) {
			const e = { ...state, GITHUB_DISPATCH_TOKEN: CANARY, DATABASE_URL: `postgres://u:${CANARY}@h/db` };
			for (const page of ["/dashboards", "widget:dashboards"]) {
				const out = JSON.stringify(renderAdminRoute({ page }, e, now));
				const ctx = `${name} ${page}`;
				expect(out, ctx).not.toContain(CANARY);
				expect(out, ctx).not.toMatch(/postgres(ql)?:\/\//);
				expect(scrub(out), ctx).not.toMatch(generic);
				// The expiry blocks really rendered (so this test is not vacuous), except the page-only states on the widget.
				if (name === "warning" || name === "expired") expect(out, ctx).toContain("GITHUB_DISPATCH_TOKEN");
				if (page === "/dashboards") expect(out, ctx).toMatch(/GITHUB_DISPATCH_TOKEN/);
			}
		}
	});

	it("the generic leak regex still fires on anything outside the allowlist", () => {
		const allowed = [TOKEN_ROTATE_URL, "GITHUB_DISPATCH_TOKEN_EXPIRES_AT", "GITHUB_DISPATCH_TOKEN", "Rotate token"];
		const scrub = (s: string) => allowed.reduce((acc, a) => acc.replaceAll(a, ""), s);
		for (const leak of ["your token is abc", "SECRET", "password=1", "api_key", "access-tokens"]) {
			expect(scrub(`x ${leak} y`)).toMatch(/token|password|secret|api[_-]?key/i);
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

describe("GITHUB_DISPATCH_TOKEN expiry reminder (GON-216)", () => {
	const NOW = new Date("2027-10-27T12:00:00Z"); // 30 days before 2027-11-26
	const text = (res: unknown) => JSON.stringify(res);
	const route = (page: string, e: Record<string, string>) => renderAdminRoute({ page }, { ...e }, NOW);

	it("is healthy above 30 days", () => {
		expect(getTokenExpiryState("2027-11-27", NOW)).toMatchObject({ status: "healthy", daysLeft: 31 });
		expect(getTokenExpiryState("2028-11-26", NOW).status).toBe("healthy");
	});

	it("warns at the 30 day and 1 day boundaries", () => {
		expect(getTokenExpiryState("2027-11-26", NOW)).toMatchObject({ status: "warning", daysLeft: 30 });
		expect(getTokenExpiryState("2027-10-28", NOW)).toMatchObject({ status: "warning", daysLeft: 1 });
	});

	it("is expired at 0 days and for past dates", () => {
		expect(getTokenExpiryState("2027-10-27", NOW)).toMatchObject({ status: "expired", daysLeft: 0 });
		expect(getTokenExpiryState("2026-01-01", NOW).status).toBe("expired");
	});

	it("is unset when missing or malformed", () => {
		for (const bad of [undefined, "", "  ", "2027-13-01", "2027-02-30", "11/26/2027", "2027-1-1", "soon"]) {
			expect(getTokenExpiryState(bad, NOW).status).toBe("unset");
		}
	});

	it("shows a quiet line on the page only when healthy", () => {
		const e = { GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2028-01-15" };
		expect(text(route("/dashboards", e))).toContain("expires 2028-01-15 (80 days left)");
		expect(text(route("/dashboards", e))).toContain(TOKEN_ROTATE_URL);
		expect(text(route("widget:dashboards", e))).not.toContain("GITHUB_DISPATCH_TOKEN");
	});

	it("puts a warning with a Rotate token button first on page and widget", () => {
		const e = { GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2027-11-26" };
		for (const page of ["/dashboards", "widget:dashboards"]) {
			const res = route(page, e);
			expect(res.blocks[0]).toMatchObject({ type: "section" });
			expect(text(res.blocks[0])).toContain("expires on 2027-11-26 (in 30 days)");
			expect(text(res.blocks[1])).toContain("Rotate token");
			expect(text(res.blocks[1])).toContain(TOKEN_ROTATE_URL);
		}
	});

	it("shows an urgent alert on page and widget when expired", () => {
		const e = { GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2027-10-01" };
		for (const page of ["/dashboards", "widget:dashboards"]) {
			expect(text(route(page, e))).toMatch(/expired on 2027-10-01.*rebuilds will fail/);
		}
	});

	it("shows the unset notice only on the page in production", () => {
		expect(text(route("/dashboards", { SITE_ENV: "production" }))).toContain("missing or not a valid");
		expect(text(route("/dashboards", { SITE_ENV: "production", GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "bad" }))).toContain("missing or not a valid");
		expect(text(route("/dashboards", { SITE_ENV: "local" }))).not.toContain("missing or not a valid");
		expect(text(route("widget:dashboards", { SITE_ENV: "production" }))).not.toContain("missing or not a valid");
	});

	it("never renders the token value", () => {
		const SECRET = "github_pat_SECRETVALUE";
		const out = text(route("/dashboards", { GITHUB_DISPATCH_TOKEN: SECRET, GITHUB_DISPATCH_TOKEN_EXPIRES_AT: "2027-11-01" }));
		expect(out).not.toContain(SECRET);
	});

	it("no longer lists the legacy Vercel link", () => {
		expect(JSON.stringify(DASHBOARD_CATEGORIES).toLowerCase()).not.toContain("vercel");
	});
});
