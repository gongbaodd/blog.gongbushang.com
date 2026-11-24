import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { hyperdrive } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import mermaid from "astro-mermaid";
import { rebuildOnPublish } from "./src/plugins/rebuild-on-publish/index.ts";
import { cloudinaryMedia } from "./src/lib/cloudinary-media/index.ts";

export default defineConfig({
	output: "server",
	// passthrough: no IMAGES binding (Cloudflare Images transforms may be paid); Cloudinary does transforms (D6).
	adapter: cloudflare({ imageService: "passthrough" }),
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
			// Media lives on Cloudinary (D6): no R2 storage; media provider only.
			plugins: [rebuildOnPublish()],
			mediaProviders: [cloudinaryMedia({ folder: "growgen" })],
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
