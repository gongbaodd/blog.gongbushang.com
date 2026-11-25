import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, sessionDrivers } from "astro/config";
import emdash, { memoryCache } from "emdash/astro";
import { postgres } from "emdash/db";
import { localMedia } from "emdash/media";
import { cloudinaryMedia } from "./src/cloudinary-media.ts";
import { rebuildOnPublish } from "./src/rebuild-on-publish.ts";

// Public origin for passkey RP ID & outbound links: resolved at runtime via EMDASH_SITE_URL / SITE_URL too.
const site = process.env.EMDASH_SITE_URL || process.env.SITE_URL || "http://localhost:4322";

// Node-compatible Astro session driver (D12): fs-lite by default, or in-memory when SESSION_DRIVER=memory.
const sessionDriver =
	process.env.SESSION_DRIVER === "memory"
		? sessionDrivers.memory()
		: sessionDrivers.fsLite({ base: process.env.SESSION_DIR || ".astro/sessions" });

export default defineConfig({
	site,
	output: "server",
	adapter: node({ mode: "standalone" }),
	server: {
		host: process.env.HOST || "0.0.0.0",
		port: Number(process.env.PORT) || 4322,
	},
	session: {
		driver: sessionDriver,
	},
	integrations: [
		react(),
		emdash({
			database: postgres({ connectionString: process.env.DATABASE_URL }),
			objectCache: memoryCache({ defaultTtl: 600 }),
			fonts: false,
			middleware: { outer: "./src/pages/healthz.ts" },
			plugins: [rebuildOnPublish()],
			mediaProviders: [localMedia({ enabled: false }), cloudinaryMedia({ folder: "growgen" })],
		}),
	],
	vite: {
		plugins: [
			{
				// EmDash serializes `virtual:emdash/config` at `astro build` time. Wrap `createDialect`
				// so `process.env.DATABASE_URL` supplied at container runtime always takes effect.
				name: "admin-runtime-database-url",
				transform(code, id) {
					if (id === "\0virtual:emdash/dialect") {
						return code.replace(
							"export const createDialect = _createDialect;",
							"export const createDialect = (cfg = {}) => _createDialect({ ...cfg, connectionString: process.env.DATABASE_URL || cfg.connectionString });",
						);
					}
				},
			},
		],
	},
	devToolbar: { enabled: false },
});
