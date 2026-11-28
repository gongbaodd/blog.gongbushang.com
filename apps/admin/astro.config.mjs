import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, sessionDrivers } from "astro/config";
import emdash, { memoryCache } from "emdash/astro";
import { google } from "emdash/auth/providers/google";
import { postgres } from "emdash/db";
import { localMedia } from "emdash/media";
import { fileURLToPath } from "node:url";
import { cloudinaryMedia } from "./src/cloudinary-media.ts";
import { PLACEHOLDER_DATABASE_URL } from "./src/db-config.ts";
import { serviceDashboards } from "./src/dashboards/plugin.ts";
import { buildInfo } from "./src/build-info/plugin.ts";
import { podcastSync } from "./src/podcast-sync/plugin.ts";
import { markdownEditor } from "./src/markdown-editor/plugin.ts";
import { postFields } from "./src/post-fields/plugin.ts";
import { rebuildOnPublish } from "./src/rebuild-on-publish.ts";

// Public origin for passkey RP ID & outbound links: resolved at runtime via EMDASH_SITE_URL / SITE_URL too.
const site = process.env.EMDASH_SITE_URL || process.env.SITE_URL || "http://localhost:4322";

// Node-compatible Astro session driver (D12): fs-lite by default, or in-memory when SESSION_DRIVER=memory.
const sessionDriver =
	process.env.SESSION_DRIVER === "memory"
		? sessionDrivers.memory()
		: sessionDrivers.fsLite({ base: process.env.SESSION_DIR || ".astro/sessions" });

const adminPackageJson = fileURLToPath(new URL("./package.json", import.meta.url));
const sharedWebSource = fileURLToPath(new URL("../web/src/", import.meta.url));

const dbConfigModule = fileURLToPath(new URL("./src/db-config.ts", import.meta.url));

export default defineConfig({
	site,
	output: "server",
	adapter: node({ mode: "standalone" }),
	server: {
		// Loopback by default; the container sets HOST=0.0.0.0 itself (and the adapter prefers the HOST env at runtime).
		host: process.env.HOST || "127.0.0.1",
		port: Number(process.env.PORT) || 4322,
	},
	session: {
		driver: sessionDriver,
	},
	integrations: [
		react(),
		emdash({
			// Placeholder only: this config is serialized into dist/. The real DATABASE_URL is read at runtime (see the vite plugin).
			database: postgres({ connectionString: PLACEHOLDER_DATABASE_URL }),
			objectCache: memoryCache({ defaultTtl: 600 }),
			fonts: false,
			// Runs before EmDash's own middleware: /healthz, then the Cloudflare Access gate.
			middleware: { outer: "./src/outer.ts" },
			// Passkeys stay. Google (GON-252) reads EMDASH_OAUTH_GOOGLE_CLIENT_ID/_SECRET from process.env at RUNTIME inside EmDash's
			// routes, so nothing is baked. The provider is registered unconditionally: this config is serialized at image build time,
			// when the runtime env does not exist. Without the env the button ends on a "provider not configured" login error.
			// Who may sign in is decided by ADMIN_ALLOWED_EMAILS (src/outer.ts).
			authProviders: [google()],
			plugins: [rebuildOnPublish(), serviceDashboards(), podcastSync(), markdownEditor(), postFields(), buildInfo()],
			mediaProviders: [localMedia({ enabled: false }), cloudinaryMedia({ folder: "growgen" })],
		}),
	],
	vite: {
		plugins: [
			{
				// Modules shared from apps/web/src (markdown-shared.ts, mdx-lite.ts, cloudinary.ts) import packages by bare name. In the
				// Docker build apps/web has no node_modules, so resolve those imports from this package instead (GON-249).
				name: "admin-resolve-shared-web-deps",
				async resolveId(source, importer, options) {
					if (!importer?.startsWith(sharedWebSource) || source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) return null;
					return this.resolve(source, adminPackageJson, { ...options, skipSelf: true });
				},
			},
			{
				// EmDash serializes `virtual:emdash/config` at `astro build` time. Replace the dialect factory so the pool is always
				// built from the runtime environment (DATABASE_URL, TLS unless loopback, small pool) and fails closed without it.
				name: "admin-runtime-database-url",
				transform(code, id) {
					if (id === "\0virtual:emdash/dialect") {
						const marker = "export const createDialect = _createDialect;";
						if (!code.includes(marker)) {
							throw new Error("admin-runtime-database-url: emdash dialect virtual module changed; update this plugin");
						}
						return (
							`import { runtimeDialectConfig as _runtimeDialectConfig } from ${JSON.stringify(dbConfigModule)};\n` +
							code.replace(
								marker,
								"export const createDialect = (cfg = {}) => _createDialect({ ...cfg, ..._runtimeDialectConfig() });",
							)
						);
					}
				},
			},
		],
	},
	devToolbar: { enabled: false },
});
