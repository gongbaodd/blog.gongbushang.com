/**
 * Shared Vitest setup for jsdom-based component tests.
 *
 * jsdom does not implement several browser APIs that Mantine and other
 * UI libraries call during render (notably `window.matchMedia`, which
 * Mantine's color-scheme provider requires). Polyfill them here so each
 * test file does not need its own copy (see src/components/Umap.test.tsx
 * for the original local version).
 *
 * Guards keep this harmless for node-environment test files.
 */
import { vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// With Vitest `globals: false` there is no global `afterEach`, so
// @testing-library/react's automatic DOM cleanup never runs and rendered
// components leak between tests (causing "Found multiple elements"
// errors). Register cleanup explicitly.
afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== "function") {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
  }

  if (typeof (globalThis as Record<string, unknown>).IntersectionObserver !== "function") {
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      root = null;
      rootMargin = "";
      thresholds = [];
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    };
  }
}
