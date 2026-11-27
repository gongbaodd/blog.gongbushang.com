import { defineConfig } from "vitest/config";

// micromark and devlop ship a `development` build whose assertions reject inputs the production build accepts (remark-attributes
// `{.class}` / `{#id}`). The render-parity tests must run the same code as `astro build`, so resolve the production builds.
process.env.NODE_ENV = "production";

export default defineConfig({
	resolve: {
		alias: {
			"astro:middleware": "astro/virtual-modules/middleware.js",
		},
	},
	test: { include: ["src/**/*.test.ts"], environment: "node" },
});
