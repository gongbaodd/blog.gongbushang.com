// Reusable URL-parity checker module (QA-1 / Decision D8).
// Compares built `dist/client` public paths against `legacy-route-groups.json` and `legacy-urls.txt`.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	DIST_CLIENT,
	LEGACY_GROUPS_PATH,
	LEGACY_REDIRECTS_PATH,
	LEGACY_URLS_PATH,
	builtPaths,
	diffGroup,
	loadGroups,
	isInfraPath,
	latestLegacyPostDate,
	legacyCategories,
	loadLegacyRedirects,
	loadLegacyUrls,
	normalizePath,
	postDateKey,
} from "./built-paths.ts";

export interface ParityOptions {
	dir?: string;
	groups?: string[];
	all?: boolean;
	ignoreGroups?: string[];
	allowMissing?: string[];
	groupsFile?: string;
	urlsFile?: string;
	/** `<old> <new>` redirect list (default tests/legacy-redirects.txt). */
	redirectsFile?: string;
	failOnExtra?: boolean;
	/** Paths/globs (or a file of them) that may exist in the build without being a legacy URL. */
	allowExtra?: string[];
}

export interface GroupParityResult {
	group: string;
	expected: number;
	allowedMissing: number;
	present: number;
	missingCount: number;
	missing: string[];
}

export interface ParityReport {
	ok: boolean;
	dir: string;
	mode: "all" | "groups";
	selectedGroups: string[];
	ignoredGroups: string[];
	allowMissingPatterns: string[];
	builtCount: number;
	totals: {
		expected: number;
		allowedMissing: number;
		present: number;
		missing: number;
		extra: number;
	};
	/** Built paths that are not legacy URLs but are allowed (`--allow-extra`). */
	allowedExtraPaths: string[];
	/** Post-shaped paths (page, `/api/cards|relates`) dated after the newest legacy post: genuinely new posts. */
	newPostPaths: string[];
	/** Date (`YYYYMMDD`) of the newest legacy post; built posts dated after it count as new. */
	legacyLatestPostDate: string;
	groups: GroupParityResult[];
	extraPaths: string[];
	error?: string;
}

/**
 * Expand `--allow-missing` entries: if an entry points to an existing file on disk,
 * read non-empty non-comment lines from it; otherwise split comma-separated patterns.
 */
export function resolveAllowMissingPatterns(inputs: string[] = []): string[] {
	const patterns: string[] = [];
	for (const raw of inputs) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (existsSync(trimmed) && statSync(trimmed).isFile()) {
			const lines = readFileSync(trimmed, "utf8")
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => line.length > 0 && !line.startsWith("#"));
			patterns.push(...lines);
			continue;
		}
		for (const part of trimmed.split(",")) {
			const p = part.trim();
			if (p) patterns.push(p);
		}
	}
	return patterns;
}

/** Convert a glob/exact path pattern into a matcher against normalized URL paths. */
export function compilePathMatcher(pattern: string): (candidate: string) => boolean {
	const hasWildcard = /[*?]/.test(pattern);
	if (!hasWildcard) {
		const exact = normalizePath(pattern);
		return (candidate: string) => normalizePath(candidate) === exact;
	}

	let normPattern = normalizePath(pattern);
	// Preserve leading wildcard patterns like `*.svg` or `**/*.svg`
	if (pattern.trim().startsWith("*")) {
		normPattern = normPattern.slice(1); // remove leading `/` added by normalizePath
	}

	let regexStr = "";
	for (let i = 0; i < normPattern.length; i++) {
		const ch = normPattern[i];
		if (ch === "*") {
			if (normPattern[i + 1] === "*") {
				if (normPattern[i + 2] === "/") {
					regexStr += "(?:.*/)?";
					i += 2;
				} else {
					regexStr += ".*";
					i += 1;
				}
			} else {
				regexStr += "[^/]*";
			}
		} else if (ch === "?") {
			regexStr += "[^/]";
		} else {
			regexStr += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}

	const prefix = normPattern.startsWith("/") ? "^" : "(?:^|/)";
	const re = new RegExp(`${prefix}${regexStr}$`);
	return (candidate: string) => re.test(normalizePath(candidate));
}

export function runParityCheck(options: ParityOptions = {}): ParityReport {
	const dir = options.dir ?? DIST_CLIENT;
	const groupsFile = options.groupsFile ?? LEGACY_GROUPS_PATH;
	const urlsFile = options.urlsFile ?? LEGACY_URLS_PATH;
	const failOnExtra = options.failOnExtra ?? false;

	if (options.all && options.groups && options.groups.length > 0) {
		throw new Error("Cannot combine --all and --groups; choose one mode.");
	}

	const { groups } = loadGroups(groupsFile);
	const availableGroups = Object.keys(groups);
	const availableSet = new Set(availableGroups);

	const ignoredGroups = [...new Set((options.ignoreGroups ?? []).map((g) => g.trim()).filter(Boolean))];
	for (const g of ignoredGroups) {
		if (!availableSet.has(g)) {
			throw new Error(`Unknown group in --ignore-group: "${g}". Valid groups: ${availableGroups.join(", ")}`);
		}
	}
	const ignoredSet = new Set(ignoredGroups);

	const mode: "all" | "groups" = options.groups && options.groups.length > 0 ? "groups" : "all";
	let selectedGroups: string[];
	if (mode === "groups") {
		const requested = [...new Set(options.groups!.map((g) => g.trim()).filter(Boolean))];
		for (const g of requested) {
			if (!availableSet.has(g)) {
				throw new Error(`Unknown group in --groups: "${g}". Valid groups: ${availableGroups.join(", ")}`);
			}
		}
		selectedGroups = requested.filter((g) => !ignoredSet.has(g));
	} else {
		selectedGroups = availableGroups.filter((g) => !ignoredSet.has(g));
	}

	const allowMissingPatterns = resolveAllowMissingPatterns(options.allowMissing);
	const matchers = allowMissingPatterns.map(compilePathMatcher);
	const isAllowedMissing = (p: string) => matchers.some((m) => m(p));

	const allowExtraMatchers = resolveAllowMissingPatterns(options.allowExtra).map(compilePathMatcher);
	const isAllowedExtra = (p: string) => allowExtraMatchers.some((m) => m(p));

	const baseEmptyReport = (error: string): ParityReport => ({
		ok: false,
		dir,
		mode,
		selectedGroups,
		ignoredGroups,
		allowMissingPatterns,
		builtCount: 0,
		totals: { expected: 0, allowedMissing: 0, present: 0, missing: 0, extra: 0 },
		groups: [],
		extraPaths: [],
		allowedExtraPaths: [],
		newPostPaths: [],
		legacyLatestPostDate: "",
		error,
	});

	if (!existsSync(dir)) {
		return baseEmptyReport(`Build directory does not exist: ${dir}`);
	}
	if (!statSync(dir).isDirectory()) {
		return baseEmptyReport(`Build path is not a directory: ${dir}`);
	}

	const built = builtPaths(dir);
	if (built.size === 0) {
		return baseEmptyReport(`Build directory is empty: ${dir}`);
	}

	const allGroupPaths = Object.values(groups).flatMap((g) => g.paths);
	const allGroupNorm = new Set(allGroupPaths.map((p) => normalizePath(p)));
	const legacyTxtUrls = existsSync(urlsFile) ? loadLegacyUrls(urlsFile) : [];
	const ungroupedUrls = legacyTxtUrls.filter((u) => !allGroupNorm.has(normalizePath(u)));
	const allLegacy = new Set([...allGroupPaths, ...legacyTxtUrls]);

	const groupResults: GroupParityResult[] = [];

	// GON-240: a legacy URL that moved is accepted when the new URL is built AND the build's `_redirects` 301s the old one to it.
	const redirects = loadLegacyRedirects(options.redirectsFile ?? LEGACY_REDIRECTS_PATH);
	const redirectsText = existsSync(join(dir, "_redirects")) ? readFileSync(join(dir, "_redirects"), "utf8") : "";
	const redirectedTo = new Map<string, string>();
	for (const [from, to] of redirects) {
		const ruled = redirectsText.split(/\r?\n/).some((l) => /^\s*[^#\s]/.test(l) && l.trim().split(/\s+/).slice(0, 3).join(" ") === `${from} ${to} 301`);
		if (ruled && built.has(normalizePath(to))) redirectedTo.set(normalizePath(from), to);
	}
	const isRedirected = (p: string) => redirectedTo.has(normalizePath(p));

	const checkBucket = (name: string, paths: string[]) => {
		const { missing: rawMissing } = diffGroup(paths, built, allLegacy);
		const missing: string[] = [];
		let allowedMissing = 0;
		let redirected = 0;
		for (const p of rawMissing) {
			if (isRedirected(p)) {
				redirected += 1;
				continue;
			}
			if (isAllowedMissing(p)) allowedMissing += 1;
			else missing.push(p);
		}
		const expected = paths.length;
		const present = expected - rawMissing.length + redirected;
		groupResults.push({
			group: name,
			expected,
			allowedMissing,
			present,
			missingCount: missing.length,
			missing,
		});
	};

	for (const name of selectedGroups) {
		checkBucket(name, groups[name].paths);
	}
	if (mode === "all" && ungroupedUrls.length > 0) {
		checkBucket("(ungrouped)", ungroupedUrls);
	}

	// Extras: built paths that are not legacy URLs. Infra files are always ignored; paths of posts newer
	// than the legacy snapshot are "new posts" (reported, never failing); `--allow-extra` covers the rest.
	const legacyLatestPostDate = latestLegacyPostDate(allLegacy);
	const categories = legacyCategories(allLegacy);
	const { extra: rawExtra } = diffGroup([], built, allLegacy);
	const extraPaths: string[] = [];
	const allowedExtraPaths: string[] = [];
	const newPostPaths: string[] = [];
	for (const p of rawExtra) {
		const key = postDateKey(p, categories);
		if (key && key >= legacyLatestPostDate) newPostPaths.push(p);
		else if (isAllowedExtra(p) || isInfraPath(p) || [...redirectedTo.values()].some((t) => normalizePath(t) === normalizePath(p))) allowedExtraPaths.push(p);
		else extraPaths.push(p);
	}

	const totals = groupResults.reduce(
		(acc, g) => ({
			expected: acc.expected + g.expected,
			allowedMissing: acc.allowedMissing + g.allowedMissing,
			present: acc.present + g.present,
			missing: acc.missing + g.missingCount,
			extra: extraPaths.length,
		}),
		{ expected: 0, allowedMissing: 0, present: 0, missing: 0, extra: extraPaths.length },
	);

	const ok = totals.missing === 0 && (!failOnExtra || totals.extra === 0);

	return {
		ok,
		dir,
		mode,
		selectedGroups,
		ignoredGroups,
		allowMissingPatterns,
		builtCount: built.size,
		totals,
		groups: groupResults,
		extraPaths,
		allowedExtraPaths,
		newPostPaths,
		legacyLatestPostDate,
	};
}

export function formatHumanSummary(report: ParityReport, previewLimit = 20): string {
	const lines: string[] = [];
	lines.push(`URL Parity Check: ${report.ok ? "PASS" : "FAIL"}`);
	lines.push(`Directory: ${report.dir} (${report.builtCount} built paths)`);
	lines.push(
		`Mode: ${report.mode}` +
			` | Ignored groups: ${report.ignoredGroups.length ? report.ignoredGroups.join(", ") : "none"}` +
			` | Allow-missing patterns: ${report.allowMissingPatterns.length}`,
	);

	if (report.error) {
		lines.push("");
		lines.push(`Error: ${report.error}`);
		return lines.join("\n");
	}

	lines.push("");
	const nameWidth = Math.max(5, ...report.groups.map((g) => g.group.length), "TOTAL".length);
	const pad = (s: string | number, w: number, left = false) =>
		left ? String(s).padEnd(w) : String(s).padStart(w);

	lines.push(`${pad("Group", nameWidth, true)}  ${pad("Expected", 8)}  ${pad("Allowed", 7)}  ${pad("Present", 7)}  ${pad("Missing", 7)}`);
	lines.push(`${"-".repeat(nameWidth)}  ${"-".repeat(8)}  ${"-".repeat(7)}  ${"-".repeat(7)}  ${"-".repeat(7)}`);
	for (const g of report.groups) {
		lines.push(
			`${pad(g.group, nameWidth, true)}  ${pad(g.expected, 8)}  ${pad(g.allowedMissing, 7)}  ${pad(g.present, 7)}  ${pad(g.missingCount, 7)}`,
		);
	}
	lines.push(`${"-".repeat(nameWidth)}  ${"-".repeat(8)}  ${"-".repeat(7)}  ${"-".repeat(7)}  ${"-".repeat(7)}`);
	lines.push(
		`${pad("TOTAL", nameWidth, true)}  ${pad(report.totals.expected, 8)}  ${pad(report.totals.allowedMissing, 7)}  ${pad(report.totals.present, 7)}  ${pad(report.totals.missing, 7)}`,
	);

	const allMissing = report.groups.flatMap((g) => g.missing.map((path) => ({ group: g.group, path })));
	lines.push("");
	if (allMissing.length === 0) {
		lines.push("Missing paths (0 total): none");
	} else {
		const shown = allMissing.slice(0, previewLimit);
		lines.push(`Missing paths (${allMissing.length} total, showing first ${shown.length}):`);
		for (const item of shown) {
			lines.push(`  [${item.group}] ${item.path}`);
		}
		if (allMissing.length > shown.length) {
			lines.push(`  ... and ${allMissing.length - shown.length} more`);
		}
	}

	lines.push(
		`New posts newer than the legacy snapshot (${report.legacyLatestPostDate}): ${report.newPostPaths.length} paths` +
			` | allowed extras (--allow-extra): ${report.allowedExtraPaths.length}`,
	);
	if (report.extraPaths.length === 0) {
		lines.push("Unexpected extra paths (0 total): none");
	} else {
		const shownExtra = report.extraPaths.slice(0, previewLimit);
		lines.push(`Unexpected extra paths (${report.extraPaths.length} total, showing first ${shownExtra.length}):`);
		for (const p of shownExtra) {
			lines.push(`  ${p}`);
		}
		if (report.extraPaths.length > shownExtra.length) {
			lines.push(`  ... and ${report.extraPaths.length - shownExtra.length} more`);
		}
	}

	return lines.join("\n");
}
