import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
	LEGACY_GROUPS_PATH,
	LEGACY_URLS_PATH,
	builtPaths,
	diffGroup,
	loadGroups,
	loadLegacyUrls,
	normalizePath,
} from "./built-paths.ts";
import { formatHumanSummary, runParityCheck } from "./parity.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(here, "check-parity.mjs");

const tempDirs: string[] = [];

function makeTempDir(prefix = "qa1-parity-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function writeFiles(root: string, files: Record<string, string>) {
	for (const [rel, content] of Object.entries(files)) {
		const full = join(root, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content, "utf8");
	}
}

function writeSnapshotFixture(root: string, groups: Record<string, string[]>, urls?: string[]) {
	const groupsFile = join(root, "groups.json");
	const urlsFile = join(root, "urls.txt");
	const entries = Object.entries(groups).map(([name, paths]) => [
		name,
		{ count: paths.length, paths },
	]);
	const allPaths = urls ?? Object.values(groups).flat();
	writeFileSync(
		groupsFile,
		JSON.stringify({
			total: Object.values(groups).reduce((n, p) => n + p.length, 0),
			groups: Object.fromEntries(entries),
		}),
	);
	writeFileSync(urlsFile, ["# fixture", ...allPaths].join("\n") + "\n");
	return { groupsFile, urlsFile };
}

afterEach(() => {
	while (tempDirs.length) {
		rmSync(tempDirs.pop()!, { recursive: true, force: true });
	}
});

describe("real legacy snapshots (legacy-route-groups.json & legacy-urls.txt)", () => {
	test("group counts match paths length and sum to total", () => {
		const data = loadGroups(LEGACY_GROUPS_PATH);
		const groupEntries = Object.entries(data.groups);
		expect(groupEntries.length).toBeGreaterThan(0);

		let sum = 0;
		for (const [name, group] of groupEntries) {
			expect(group.paths.length, `group ${name}`).toBe(group.count);
			sum += group.count;
		}
		expect(sum).toBe(data.total);
		expect(sum).toBe(4945);
	});

	test("group paths match legacy-urls.txt 1:1 with zero normalized collisions", () => {
		const data = loadGroups(LEGACY_GROUPS_PATH);
		const groupUrls = Object.values(data.groups).flatMap((g) => g.paths);
		const txtUrls = loadLegacyUrls(LEGACY_URLS_PATH);

		expect(txtUrls.length).toBe(data.total);
		expect(new Set(groupUrls)).toEqual(new Set(txtUrls));

		const normalized = txtUrls.map((u) => normalizePath(u));
		expect(new Set(normalized).size).toBe(txtUrls.length);
	});
});

describe("builtPaths & normalization", () => {
	test("handles percent-encoded Unicode, hash, space, and NFD/NFC filenames", () => {
		const root = makeTempDir();
		const distDir = join(root, "dist/client");
		writeFiles(distDir, {
			"index.html": "home",
			"tag/宇宙编辑部/index.html": "unicode-tag",
			"tag/c#/index.html": "csharp-tag",
			"api/tag/react%20native/0.ndjson": "ndjson",
			"tag/cafe\u0301/index.html": "nfd-tag",
		});

		const built = builtPaths(distDir);
		expect(built.has("/")).toBe(true);
		expect(built.has("/tag/宇宙编辑部/")).toBe(true);

		const legacy = [
			"/",
			"/tag/%E5%AE%87%E5%AE%99%E7%BC%96%E8%BE%91%E9%83%A8/",
			"/tag/c%23/",
			"/api/tag/react native/0.ndjson",
			"/tag/caf\u00e9/",
		];
		const { missing, extra } = diffGroup(legacy, built, new Set(legacy));
		expect(missing).toEqual([]);
		expect(extra).toEqual([]);
	});

	test("normalizes trailing slashes without collapsing root or extensions", () => {
		const root = makeTempDir();
		const distDir = join(root, "dist/client");
		writeFiles(distDir, {
			"index.html": "home",
			"about/index.html": "about",
			"404.html": "404",
			CNAME: "blog.gongbushang.com",
		});

		const built = builtPaths(distDir);
		const legacy = ["/", "/about", "/404.html", "/CNAME"];
		const { missing, extra } = diffGroup(legacy, built, new Set(legacy));
		expect(missing).toEqual([]);
		expect(extra).toEqual([]);
	});
});

describe("runParityCheck", () => {
	test("supports scoped --groups vs --all", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, {
			post: ["/fe/2025/01/01/hello/"],
			static: ["/", "/about/"],
		});
		const distDir = join(root, "dist/client");
		writeFiles(distDir, {
			"fe/2025/01/01/hello/index.html": "post",
			"about/index.html": "about",
		});

		// Scoped to `post` passes, and `/about/` is in allLegacy so not flagged as extra
		const scoped = runParityCheck({
			dir: distDir,
			groups: ["post"],
			groupsFile,
			urlsFile,
		});
		expect(scoped.ok).toBe(true);
		expect(scoped.totals).toEqual({ expected: 1, allowedMissing: 0, present: 1, missing: 0, extra: 0 });

		// `--all` catches missing `/` from `static`
		const full = runParityCheck({
			dir: distDir,
			all: true,
			groupsFile,
			urlsFile,
		});
		expect(full.ok).toBe(false);
		expect(full.totals.missing).toBe(1);
		expect(full.groups.find((g) => g.group === "static")?.missing).toEqual(["/"]);
	});

	test("detects missing and unexpected extra paths while ignoring _astro, _emdash, and _noop", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, {
			post: ["/fe/2025/01/01/a/", "/fe/2025/01/01/b/"],
			static: ["/"],
		});
		const distDir = join(root, "dist/client");
		writeFiles(distDir, {
			"index.html": "home",
			"fe/2025/01/01/a/index.html": "a",
			"unexpected/index.html": "extra-page",
			"extra.json": "extra-file",
			"_astro/chunk.js": "js",
			"_emdash/admin/index.html": "admin",
			"nested/_noop/file.txt": "noop",
		});

		const report = runParityCheck({ dir: distDir, all: true, groupsFile, urlsFile });
		expect(report.ok).toBe(false);
		expect(report.totals.missing).toBe(1);
		expect(report.totals.extra).toBe(2);
		expect(report.extraPaths).toEqual(["/extra.json", "/unexpected/"]);

		const summary = formatHumanSummary(report, 1);
		expect(summary).toContain("URL Parity Check: FAIL");
		expect(summary).toContain("Missing paths (1 total, showing first 1):");
		expect(summary).toContain("Unexpected extra paths (2 total, showing first 1):");
		expect(summary).toContain("... and 1 more");
	});

	test("supports --allow-missing patterns, allow-missing files, and --ignore-group", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, {
			"api/*": ["/api/all/0.ndjson", "/api/gallery/trace/02-03-dalian.svg", "/api/gallery/trace/06-07-tallinn.svg"],
			resume: ["/resume/", "/resume/pdfs/jian-gong-fe-en.pdf"],
		});
		const distDir = join(root, "dist/client");
		writeFiles(distDir, {
			"api/all/0.ndjson": "{}",
		});

		const allowFile = join(root, "allow.txt");
		writeFileSync(allowFile, "# trace svgs dropped in PORT-8b\n/api/gallery/trace/*.svg\n");

		const report = runParityCheck({
			dir: distDir,
			all: true,
			groupsFile,
			urlsFile,
			ignoreGroups: ["resume"],
			allowMissing: [allowFile],
		});
		expect(report.ok).toBe(true);
		expect(report.totals).toEqual({
			expected: 3,
			allowedMissing: 2,
			present: 1,
			missing: 0,
			extra: 0,
		});
	});

	test("fails when dist/client does not exist or is empty", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, { static: ["/"] });

		const missingDirReport = runParityCheck({
			dir: join(root, "does-not-exist"),
			groupsFile,
			urlsFile,
		});
		expect(missingDirReport.ok).toBe(false);
		expect(missingDirReport.error).toMatch(/does not exist/);

		const emptyDir = join(root, "empty-dist");
		mkdirSync(join(emptyDir, "nested-empty"), { recursive: true });
		const emptyDirReport = runParityCheck({
			dir: emptyDir,
			groupsFile,
			urlsFile,
		});
		expect(emptyDirReport.ok).toBe(false);
		expect(emptyDirReport.error).toMatch(/empty/);
	});

	test("fails when --all checks ungrouped paths from urlsFile", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(
			root,
			{ static: ["/"] },
			["/", "/orphaned-legacy-path/"],
		);
		const distDir = join(root, "dist/client");
		writeFiles(distDir, { "index.html": "home" });

		const report = runParityCheck({ dir: distDir, all: true, groupsFile, urlsFile });
		expect(report.ok).toBe(false);
		expect(report.groups.find((g) => g.group === "(ungrouped)")?.missing).toEqual(["/orphaned-legacy-path/"]);
	});
});

describe("check-parity.mjs CLI", () => {
	test("--help prints usage and exits 0", () => {
		const res = spawnSync(process.execPath, [CLI_PATH, "--help"], { encoding: "utf8" });
		expect(res.status).toBe(0);
		expect(res.stdout).toContain("Usage: node apps/web/tests/check-parity.mjs");
		expect(res.stdout).toContain("--allow-missing");
	});

	test("--json outputs structured report and exits 0 on pass, 1 on missing/empty", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, {
			post: ["/fe/2025/01/01/hello/"],
			"api/*": ["/api/gallery/trace/a.svg"],
		});
		const distDir = join(root, "dist/client");
		writeFiles(distDir, { "fe/2025/01/01/hello/index.html": "ok" });

		// Missing trace SVG -> exit 1
		const failRes = spawnSync(
			process.execPath,
			[CLI_PATH, "--dir", distDir, "--groups-file", groupsFile, "--urls-file", urlsFile, "--all", "--json"],
			{ encoding: "utf8" },
		);
		expect(failRes.status).toBe(1);
		const failJson = JSON.parse(failRes.stdout);
		expect(failJson.ok).toBe(false);
		expect(failJson.totals.missing).toBe(1);

		// Allow missing SVG via pattern -> exit 0
		const passRes = spawnSync(
			process.execPath,
			[
				CLI_PATH,
				"--dir",
				distDir,
				"--groups-file",
				groupsFile,
				"--urls-file",
				urlsFile,
				"--all",
				"--allow-missing",
				"/api/gallery/trace/*.svg",
				"--json",
			],
			{ encoding: "utf8" },
		);
		expect(passRes.status).toBe(0);
		const passJson = JSON.parse(passRes.stdout);
		expect(passJson.ok).toBe(true);
		expect(passJson.totals.allowedMissing).toBe(1);

		// Missing dir -> exit 1
		const noDirRes = spawnSync(
			process.execPath,
			[CLI_PATH, "--dir", join(root, "missing"), "--groups-file", groupsFile, "--urls-file", urlsFile],
			{ encoding: "utf8" },
		);
		expect(noDirRes.status).toBe(1);
		expect(noDirRes.stdout).toContain("Error: Build directory does not exist");
	});

	test("exits 2 on invalid arguments, unknown group, or conflicting --all + --groups", () => {
		const root = makeTempDir();
		const { groupsFile, urlsFile } = writeSnapshotFixture(root, { static: ["/"] });
		const distDir = join(root, "dist/client");
		writeFiles(distDir, { "index.html": "ok" });

		const unknownFlag = spawnSync(process.execPath, [CLI_PATH, "--nope"], { encoding: "utf8" });
		expect(unknownFlag.status).toBe(2);

		const unknownGroup = spawnSync(
			process.execPath,
			[CLI_PATH, "--dir", distDir, "--groups-file", groupsFile, "--urls-file", urlsFile, "--groups", "bogus"],
			{ encoding: "utf8" },
		);
		expect(unknownGroup.status).toBe(2);
		expect(unknownGroup.stderr).toContain('Unknown group in --groups: "bogus"');

		const conflict = spawnSync(
			process.execPath,
			[CLI_PATH, "--dir", distDir, "--groups-file", groupsFile, "--urls-file", urlsFile, "--all", "--groups", "static"],
			{ encoding: "utf8" },
		);
		expect(conflict.status).toBe(2);
	});
});
