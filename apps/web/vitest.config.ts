import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { include: ["src/**/*.test.ts", "scripts/admin/*.test.ts", "scripts/derive/*.test.ts", "tests/parity.test.ts"], environment: "node" },
});
