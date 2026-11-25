import { defineConfig } from "vitest/config";

export default defineConfig({
	test: { include: ["src/**/*.test.ts", "scripts/admin/*.test.ts"], environment: "node" },
});
