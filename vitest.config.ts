/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "packages/utils/**/*.test.ts",
      "packages/utils/**/*.spec.ts",
      "packages/image-metadata/**/*.test.ts",
      "packages/content-prepare/**/*.test.ts",
      "packages/metadata-embedding/**/*.test.ts",
      "packages/post-embedding/**/*.test.ts",
    ],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
