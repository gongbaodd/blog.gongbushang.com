import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const script = resolve(root, "scripts/legacy-data.mjs");
const run = (env: Record<string, string>) =>
	spawnSync(process.execPath, [script], { env: { ...process.env, ...env }, encoding: "utf8" });

const dataDir = resolve(root, "../../src/content/generated"); // content submodule (D13)

describe("legacy-data build guard (DATA-1)", () => {
	it("fails when the generated dir is missing", () => {
		const r = run({ LEGACY_GENERATED_DIR: resolve(root, "data/__missing__"), ALLOW_EMPTY_DATA: "" });
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("no generated data");
	});

	it.skipIf(!existsSync(dataDir))("content submodule holds metadata, podcast and gallery", () => {
		const d = dataDir;
		expect(existsSync(resolve(d, "metadata/.umap-state.json"))).toBe(true);
		expect(readdirSync(resolve(d, "metadata")).filter((f) => f.endsWith(".json") && !f.startsWith(".")).length).toBeGreaterThan(900);
		expect(readdirSync(resolve(d, "podcast")).length).toBeGreaterThan(100);
		expect(readdirSync(resolve(d, "gallery")).filter((f) => f.endsWith(".svg")).length).toBe(75);
		expect(existsSync(resolve(d, "gallery.json"))).toBe(true);
		expect(existsSync(resolve(d, "podcast.json"))).toBe(true);
	});
});
