import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script
import { decodeAssetDirs, decodeAssetName } from "./decode-asset-dirs.mjs";

describe("decodeAssetName", () => {
	it("decodes the characters Astro percent-encodes in a tag directory", () => {
		expect(decodeAssetName("c%23")).toBe("c#");
		expect(decodeAssetName("what%3F")).toBe("what?");
		expect(decodeAssetName("100%25")).toBe("100%");
	});
	it("leaves plain, space and non-ASCII names alone", () => {
		for (const n of ["rust", "android 14", "宇宙编辑部", "index.html", "a.b"]) expect(decodeAssetName(n)).toBeNull();
	});
	it("refuses names that would change the path shape or are invalid", () => {
		for (const n of ["a%2Fb", "%2E%2E", "%5Cx", "bad%ZZ", "%E0%A4%A"]) expect(decodeAssetName(n)).toBeNull();
	});
});

describe("decodeAssetDirs", () => {
	let root = "";
	afterEach(() => root && rmSync(root, { recursive: true, force: true }));

	it("renames encoded directories at any depth and keeps their contents", () => {
		root = mkdtempSync(join(tmpdir(), "decode-"));
		for (const d of ["tag/c%23", "api/tag/c%23", "tag/rust", "tag/android 14"]) mkdirSync(join(root, d), { recursive: true });
		writeFileSync(join(root, "tag/c%23/index.html"), "x");
		writeFileSync(join(root, "api/tag/c%23/0.ndjson"), "x");
		const renamed = decodeAssetDirs(root);
		expect(renamed.map(([f]: string[]) => f).sort()).toEqual(["api/tag/c%23", "tag/c%23"]);
		expect(readdirSync(join(root, "tag")).sort()).toEqual(["android 14", "c#", "rust"]);
		expect(readdirSync(join(root, "tag/c#"))).toEqual(["index.html"]);
		expect(readdirSync(join(root, "api/tag/c#"))).toEqual(["0.ndjson"]);
	});

	it("is idempotent and refuses to clobber an existing decoded directory", () => {
		root = mkdtempSync(join(tmpdir(), "decode-"));
		mkdirSync(join(root, "tag/c%23"), { recursive: true });
		decodeAssetDirs(root);
		expect(decodeAssetDirs(root)).toEqual([]);
		mkdirSync(join(root, "tag/c%23"));
		expect(() => decodeAssetDirs(root)).toThrow(/already exists/);
	});
});
