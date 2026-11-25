import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"src/**/*.test.ts",
			"scripts/admin/*.test.ts",
			"scripts/derive/*.test.ts",
			"scripts/guards/*.test.ts",
			"scripts/import/**/*.test.ts",
			"tests/*.test.ts",
		],
		environment: "node",
	},
});
