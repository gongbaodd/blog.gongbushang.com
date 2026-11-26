import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { hyperdrive } from "@emdash-cms/cloudflare";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import emdash from "emdash/astro";
import { localMedia } from "emdash/media";
import mermaid from "astro-mermaid";
import glsl from "vite-plugin-glsl";
import { rebuildOnPublish } from "./src/plugins/rebuild-on-publish/index.ts";
import { isNoindexedPage, readNoindexIds } from "./scripts/seo/noindex-list.mjs";
import { cloudinaryMedia } from "./src/lib/cloudinary-media/index.ts";

// Public origin: env-driven (EMDASH_SITE_URL / SITE_URL), default production domain.
const site = process.env.EMDASH_SITE_URL || process.env.SITE_URL || "https://growgen.xyz";

// Live switch (D11, INF-10): only PUBLIC_SITE_LIVE=true (exact) is indexable and runs analytics/ads. Anything else, including
// unset and typos, fails closed. Independent of SITE_ENV, which only picks the rebuild-on-publish target and the admin gates.
const siteLive = process.env.PUBLIC_SITE_LIVE === "true" ? "true" : "false";

// Build output dir (default dist). scripts/e2e.mjs sets ASTRO_OUT_DIR=dist-e2e so a fake-token production build never lands in dist/.
const outDir = process.env.ASTRO_OUT_DIR || "./dist";

// Posts the SEO panel marks noindex (written by scripts/seo/write-noindex.ts before the build); read lazily, at sitemap time.
let noindexIds;

export default defineConfig({
	site,
	outDir,
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
		// Same exclusions as the legacy site; /sitemap.xml is our prerendered alias of the index.
		sitemap({
			filter: (page) =>
				!/\/(cv|gemini|umap|hero|hero-gallery|privacy|sitemap\.xml)\/?$/.test(page) &&
				!/\/hero\//.test(page) &&
				!/\/tag\//.test(page) &&
				!/\/world\//.test(page) &&
				!/\/series\//.test(page) &&
				!isNoindexedPage(page, (noindexIds ??= readNoindexIds())),
		}),
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
		define: {
			// analytics/ads gate (src/analytics/env.ts)
			"import.meta.env.PUBLIC_SITE_LIVE": JSON.stringify(siteLive),
			"import.meta.env.PUBLIC_BUILD_SHA": JSON.stringify((process.env.GITHUB_SHA ?? "").slice(0, 7)),
		},
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
