/**
 * `service-dashboards` EmDash plugin (GON-201): a sidebar page and a dashboard widget linking to the external SaaS dashboards.
 * Block Kit only (EmDash `admin.pages` + `admin.widgets` served by an `admin` route): no custom React, nothing added to the browser
 * bundle. The link data lives in ./links.ts.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type PluginDescriptor } from "emdash";
import { dashboardPage, dashboardWidget, tokenExpiryBlocks } from "./blocks.ts";
import { resolveDashboards, type DashboardEnv } from "./links.ts";
import { getTokenExpiryState } from "./token-expiry.ts";

export const PLUGIN_ID = "service-dashboards";
const VERSION = "0.1.0";
const PAGES = [{ path: "/dashboards", label: "Service dashboards", icon: "link-external" }];
const WIDGETS = [{ id: "dashboards", title: "Service dashboards", size: "full" as const }];

export function readDashboardEnv(env: NodeJS.ProcessEnv = process.env): DashboardEnv {
	return {
		SUPABASE_PRODUCTION_REF: env.SUPABASE_PRODUCTION_REF,
		CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
		GITHUB_DISPATCH_TOKEN_EXPIRES_AT: env.GITHUB_DISPATCH_TOKEN_EXPIRES_AT,
		SITE_ENV: env.SITE_ENV,
	};
}

/** Pure route logic: the host sends `{ type: "page_load", page }`, where widgets use `page: "widget:<id>"`. */
export function renderAdminRoute(input: unknown, env: NodeJS.ProcessEnv = process.env, now: Date = new Date()) {
	const dashEnv = readDashboardEnv(env);
	const categories = resolveDashboards(dashEnv);
	const state = getTokenExpiryState(dashEnv.GITHUB_DISPATCH_TOKEN_EXPIRES_AT, now);
	const production = dashEnv.SITE_ENV === "production";
	const page = (input as { page?: unknown } | null)?.page;
	return typeof page === "string" && page.startsWith("widget:")
		? dashboardWidget(categories, tokenExpiryBlocks(state, "widget", production))
		: dashboardPage(categories, tokenExpiryBlocks(state, "page", production));
}

export function createPlugin(options: { env?: NodeJS.ProcessEnv } = {}) {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		admin: { pages: PAGES, widgets: WIDGETS },
		routes: {
			admin: {
				handler: async (routeCtx) => renderAdminRoute(routeCtx.input, options.env ?? process.env),
			},
		},
	});
}

export function serviceDashboards(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminPages: PAGES,
		adminWidgets: WIDGETS,
	};
}

export default createPlugin;
