/**
 * `build-info` EmDash plugin (GON-273): a dashboard widget and a sidebar page telling signed-in users which admin build is running
 * and whether a newer admin image has been published. Block Kit only (`admin.pages` + `admin.widgets` served by an `admin` route),
 * like service-dashboards: no custom React, no extra HTTP endpoint (so nothing outside the Cloudflare Access gate and EmDash auth),
 * and `/healthz` keeps its minimal `{"ok":true}` body (SEC-08). The logic lives in ./version.ts.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type PluginDescriptor } from "emdash";
import { versionBlocks } from "./blocks.ts";
import { createVersionChecker, type BuildEnv, type VersionChecker } from "./version.ts";

export const BUILD_INFO_PLUGIN_ID = "build-info";
const VERSION = "0.1.0";
const PAGES = [{ path: "/build", label: "Admin build", icon: "info" }];
const WIDGETS = [{ id: "build", title: "Admin build", size: "third" as const }];

export const readBuildEnv = (env: NodeJS.ProcessEnv = process.env): BuildEnv => ({
	BUILD_SHA: env.BUILD_SHA,
	BUILD_TIME: env.BUILD_TIME,
	ADMIN_VERSION_CHECK_TOKEN: env.ADMIN_VERSION_CHECK_TOKEN,
});

/** The host sends `{ type: "page_load", page }`; widgets use `page: "widget:<id>"`. */
export async function renderAdminRoute(input: unknown, check: VersionChecker, env: NodeJS.ProcessEnv = process.env) {
	const page = (input as { page?: unknown } | null)?.page;
	const surface = typeof page === "string" && page.startsWith("widget:") ? "widget" : "page";
	return versionBlocks(await check(readBuildEnv(env)), surface);
}

export function createPlugin(options: { env?: NodeJS.ProcessEnv; check?: VersionChecker } = {}) {
	const check = options.check ?? createVersionChecker();
	return definePlugin({
		id: BUILD_INFO_PLUGIN_ID,
		version: VERSION,
		admin: { pages: PAGES, widgets: WIDGETS },
		routes: {
			admin: {
				handler: async (routeCtx) => renderAdminRoute(routeCtx.input, check, options.env ?? process.env),
			},
		},
	});
}

export function buildInfo(): PluginDescriptor {
	return {
		id: BUILD_INFO_PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminPages: PAGES,
		adminWidgets: WIDGETS,
	};
}

export default createPlugin;
