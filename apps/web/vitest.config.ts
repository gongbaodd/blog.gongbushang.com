import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// `@/src/...` path alias (tsconfig paths) for tests that import React islands.
	resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
	test: {
		include: [
			"src/**/*.test.ts",
			"scripts/admin/*.test.ts",
			"scripts/cutover/*.test.ts",
			"scripts/derive/*.test.ts",
			"scripts/guards/*.test.ts",
			"scripts/import/**/*.test.ts",
			"scripts/perf/*.test.ts",
			"scripts/sync/*.test.ts",
			"tests/*.test.ts",
		],
		environment: "node",
		// web-ci sets DERIVE_READONLY=1 at job level for the build (INF-10). Tests must start from the default (writes on);
		// readonly.test.ts opts in with vi.stubEnv.
		env: { DERIVE_READONLY: "" },
	},
});
