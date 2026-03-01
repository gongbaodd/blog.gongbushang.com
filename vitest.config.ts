/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/utils/**/*.test.ts",
      "packages/utils/**/*.spec.ts",
      "packages/card/**/*.test.ts",
      "packages/card/**/*.test.tsx",
      "packages/carousel/**/*.test.ts",
      "packages/carousel/**/*.test.tsx",
      "packages/content/**/*.test.ts",
      "packages/content/**/*.test.tsx",
    ],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});
