import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"astro:middleware": "astro/virtual-modules/middleware.js",
		},
	},
	test: { include: ["src/**/*.test.ts"], environment: "node" },
});

