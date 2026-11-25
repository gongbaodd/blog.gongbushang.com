import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { hyperdrive } from "@emdash-cms/cloudflare";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { localMedia } from "emdash/media";
import mermaid from "astro-mermaid";
import glsl from "vite-plugin-glsl";
import { rebuildOnPublish } from "./src/plugins/rebuild-on-publish/index.ts";
import { cloudinaryMedia } from "./src/lib/cloudinary-media/index.ts";

// Public origin: env-driven (EMDASH_SITE_URL / SITE_URL), default production domain.
const site = process.env.EMDASH_SITE_URL || process.env.SITE_URL || "https://growgen.xyz";

export default defineConfig({
	site,
	// Legacy parity: prefetch every link on hover.
	prefetch: { prefetchAll: true, defaultStrategy: "hover" },
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
			// Built-in "local" (Library) provider is on by default; disable it so Cloudinary is the only provider.
			mediaProviders: [localMedia({ enabled: false }), cloudinaryMedia({ folder: "growgen" })],
		}),
	],
	vite: {
		// .vert/.frag/.glsl imports of the particle hero (legacy parity).
		plugins: [glsl()],
		resolve: {
			alias: {
				// Legacy import style `@/src/...` (see PORTING.md): `@` = apps/web root.
				"@": fileURLToPath(new URL("./", import.meta.url)),
				// webgl-components skill: nothing here uses onnxruntime-node, but a transitive import must never
				// pull the native module into a bundle (legacy aliases it to an empty module).
				"onnxruntime-node": fileURLToPath(new URL("./src/empty-module.js", import.meta.url)),
			},
		},
		optimizeDeps: {
			include: ["react-plock"], // prebundle it (client dev)
			// webgl-components skill: Rapier WASM must not be pre-bundled (no Rapier island on the home page yet).
			exclude: ["onnxruntime-node", "@dimforge/rapier3d-compat", "@react-three/rapier"],
		},
		build: {
			rollupOptions: {
				// Keep side effects (incl. Rapier WASM init) while still allowing unused-export elimination
				// (legacy comment: `treeshake: false` shipped whole icon libraries).
				treeshake: { moduleSideEffects: "no-external" },
			},
		},
		ssr: {
			// react-plock (PORT-3 masonry) ships CJS-ish ESM; legacy forced it into the SSR bundle too.
			noExternal: ["react-plock"],
			optimizeDeps: {
				// pg is CJS; without this workerd dev fails with "require is not defined"
				include: ["@emdash-cms/cloudflare > pg"],
			},
		},
	},
	devToolbar: { enabled: false },
});
