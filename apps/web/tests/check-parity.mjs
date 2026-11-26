#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DIST_CLIENT } from "./built-paths.ts";
import { formatHumanSummary, runParityCheck } from "./parity.ts";

const HELP_TEXT = `Usage: node apps/web/tests/check-parity.mjs [options]

Verify that a built dist/client directory preserves legacy URLs from
legacy-route-groups.json and legacy-urls.txt. A path is "present" when a file exists for it
(\`a/b/index.html\` for \`/a/b/\`, the file itself otherwise); content is not inspected. Comparison is exact:
trailing slash is significant (\`/about/\` is not \`/about.html\`).
Requires Node >= 22.18 (imports .ts from .mjs via native type stripping).

Options:
  --dir <path>                 Built client directory (default: ${DIST_CLIENT})
  --groups <list>              Comma-separated route groups to check (repeatable)
  --all                        Check all route groups and legacy-urls.txt (default)
  --ignore-group <group>       Skip a route group (repeatable or comma-separated)
  --allow-missing <pattern>    Path, glob pattern, or file of patterns to allow missing (repeatable)
  --groups-file <path>         Override legacy-route-groups.json path
  --urls-file <path>           Override legacy-urls.txt path
  --limit <n>                  Max missing/extra paths shown in summary (default: 20)
  --fail-on-extra              Also fail if unexpected extra paths are present. LOCAL / CUTOVER
                               check only, not a CI gate: content in the mutable production DB (a post with a new tag,
                               the first post of a new year, a new series or city) legitimately adds pages. Infra files (/.assetsignore,
                               /_headers, /sitemap.xml, /_astro/*...) and post-shaped paths (known legacy category, or
                               /api/cards|relates) of posts dated on/after the newest legacy post (new posts + their /api/cards|relates files) never count.
  --allow-extra <pattern>      Path, glob or file of patterns allowed to exist outside the legacy list (repeatable)
  --json                       Print JSON report to stdout
  -h, --help                   Show this help message and exit 0

Exit codes:
  0  Parity check passed (or --help)
  1  Missing legacy paths, empty/missing build dir, or --fail-on-extra triggered
  2  Invalid CLI arguments or unknown group name
`;

function splitList(values = []) {
	return values
		.flatMap((v) => v.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
}

export function runCli(argv = process.argv.slice(2)) {
	let parsed;
	try {
		parsed = parseArgs({
			args: argv,
			allowPositionals: false,
			options: {
				dir: { type: "string" },
				groups: { type: "string", multiple: true },
				all: { type: "boolean", default: false },
				"ignore-group": { type: "string", multiple: true },
				"allow-missing": { type: "string", multiple: true },
				"groups-file": { type: "string" },
				"urls-file": { type: "string" },
				limit: { type: "string" },
				"allow-extra": { type: "string", multiple: true },
				"fail-on-extra": { type: "boolean", default: false },
				json: { type: "boolean", default: false },
				help: { type: "boolean", short: "h", default: false },
			},
		});
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		console.error("Run with --help for usage.");
		return 2;
	}

	const { values } = parsed;
	if (values.help) {
		console.log(HELP_TEXT);
		return 0;
	}

	let previewLimit = 20;
	if (values.limit !== undefined) {
		const n = Number(values.limit);
		if (!Number.isInteger(n) || n < 0) {
			console.error(`Error: --limit must be a non-negative integer, got "${values.limit}".`);
			return 2;
		}
		previewLimit = n;
	}

	const groups = values.groups ? splitList(values.groups) : undefined;
	const ignoreGroups = values["ignore-group"] ? splitList(values["ignore-group"]) : [];
	const allowMissing = values["allow-missing"] ?? [];

	let report;
	try {
		report = runParityCheck({
			dir: values.dir ? resolve(values.dir) : undefined,
			groups,
			all: values.all,
			ignoreGroups,
			allowMissing,
			groupsFile: values["groups-file"] ? resolve(values["groups-file"]) : undefined,
			urlsFile: values["urls-file"] ? resolve(values["urls-file"]) : undefined,
			failOnExtra: values["fail-on-extra"],
			allowExtra: values["allow-extra"] ?? [],
		});
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		return 2;
	}

	if (values.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(formatHumanSummary(report, previewLimit));
	}

	return report.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = runCli();
}
