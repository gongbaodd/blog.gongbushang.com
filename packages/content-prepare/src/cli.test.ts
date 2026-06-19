import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { findRepoRoot, parseCliArgs, resolveCollectOptions } from "./cli.ts";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(srcDir, "../../..");

describe("parseCliArgs", () => {
  test("returns empty options for no args", () => {
    expect(parseCliArgs([])).toEqual({});
  });

  test("parses docs, output, and trace flags", () => {
    expect(
      parseCliArgs([
        "--docs-dir",
        "custom/docs",
        "--output",
        "custom/metadata",
        "--trace-dir",
        "custom/trace",
        "ignored",
      ]),
    ).toEqual({
      docsDir: "custom/docs",
      output: "custom/metadata",
      traceDir: "custom/trace",
    });
  });

  test("parses depth and trace regeneration flags", () => {
    expect(
      parseCliArgs(["--depth", "--regenerate-traces", "--traces-only"]),
    ).toEqual({
      depth: true,
      regenerateTraces: true,
      tracesOnly: true,
    });
  });

  test("ignores flags without a following value", () => {
    expect(parseCliArgs(["--docs-dir"])).toEqual({});
  });
});

describe("findRepoRoot", () => {
  test("finds gongbaodd-blog root from content-prepare package", async () => {
    await expect(findRepoRoot(srcDir)).resolves.toBe(repoRoot);
  });

  test("returns startDir when no matching package.json exists in the tree", async () => {
    const startDir = await fs.mkdtemp(path.join(os.tmpdir(), "content-prepare-root-"));
    try {
      await expect(findRepoRoot(startDir)).resolves.toBe(startDir);
    } finally {
      await fs.rm(startDir, { recursive: true, force: true });
    }
  });
});

describe("resolveCollectOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("resolves default paths relative to repo root", async () => {
    const options = await resolveCollectOptions({});

    expect(options.repoRoot).toBe(repoRoot);
    expect(options.docsDir).toBe(path.resolve(repoRoot, "src/content/_docs"));
    expect(options.outputDir).toBe(
      path.resolve(repoRoot, "src/content/generated/metadata"),
    );
    expect(options.traceDir).toBe(
      path.resolve(repoRoot, "src/content/generated/cover"),
    );
  });

  test("applies CLI overrides and GOOGLE_API_KEY env", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "test-google-key");

    const options = await resolveCollectOptions({
      docsDir: "alt/docs",
      output: "alt/metadata",
      traceDir: "alt/trace",
    });

    expect(options).toEqual({
      repoRoot,
      docsDir: path.resolve(repoRoot, "alt/docs"),
      outputDir: path.resolve(repoRoot, "alt/metadata"),
      traceDir: path.resolve(repoRoot, "alt/trace"),
      googleApiKey: "test-google-key",
      useDepthPrep: false,
      regenerateTraces: false,
      tracesOnly: false,
    });
  });

  test("passes depth and trace flags through resolveCollectOptions", async () => {
    const options = await resolveCollectOptions({
      depth: true,
      regenerateTraces: true,
      tracesOnly: true,
    });

    expect(options.useDepthPrep).toBe(true);
    expect(options.regenerateTraces).toBe(true);
    expect(options.tracesOnly).toBe(true);
  });
});
