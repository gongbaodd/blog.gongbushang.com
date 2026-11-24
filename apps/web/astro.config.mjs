import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { hyperdrive, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import mermaid from "astro-mermaid";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		// client script only: renders <pre class="mermaid"> (our remark plugin is in src/lib/markdown.ts)
		mermaid({ theme: "default", autoTheme: true }),
		emdash({
			database: hyperdrive({ binding: "HYPERDRIVE" }),
			storage: r2({ binding: "MEDIA" }),
		}),
	],
	vite: {
		ssr: {
			optimizeDeps: {
				// pg is CJS; without this workerd dev fails with "require is not defined"
				include: ["@emdash-cms/cloudflare > pg"],
			},
		},
	},
	devToolbar: { enabled: false },
});
