#!/usr/bin/env node
/**
 * MIG-4: deterministic bulk HTML/DOM parity diff harness.
 *
 * Compares legacy Astro `dist/` post pages against EmDash `apps/web/dist/client/`
 * post pages and emits a concise summary table plus an optional compact JSON
 * report tailored for automated triage.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LEGACY_ORIGIN,
  DEFAULT_NEW_ORIGIN,
  REPO_ROOT,
  filterPostUrls,
  runBulkDiff,
} from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_LEGACY_DIR = join(REPO_ROOT, "dist");
const DEFAULT_NEW_DIR = join(REPO_ROOT, "apps/web/dist/client");
const DEFAULT_URLS_FILE = join(REPO_ROOT, "apps/web/tests/legacy-urls.txt");
const DEFAULT_REWRITE_MAP = resolve(HERE, "../mig2/rewrite-map.json");

export function formatHelp() {
  return `Usage: node apps/web/scripts/import/mig4/diff.mjs [options]

Options:
  --legacy <dir>          Legacy dist directory (default: <repo>/dist)
  --new <dir>             New dist/client directory (default: <repo>/apps/web/dist/client)
  --urls <file>           Legacy URLs file (default: <repo>/apps/web/tests/legacy-urls.txt)
  --rewrite-map <file>    mig2 rewrite-map.json (default: ../mig2/rewrite-map.json if present)
  --out <jsonPath>        Write structured JSON report to file
  --limit <n>             Maximum number of post URLs to compare
  --filter <substring>    Filter post URLs by case-insensitive substring
  --legacy-origin <url>   Legacy canonical origin (default: ${DEFAULT_LEGACY_ORIGIN})
  --new-origin <url>      New canonical origin (default: ${DEFAULT_NEW_ORIGIN})
  --fail-on-error         Exit with code 1 if any error diffs (or missing files) are found
  -h, --help              Show this help message
`;
}

export function parseArgs(argv) {
  const opts = {
    legacyDir: DEFAULT_LEGACY_DIR,
    newDir: DEFAULT_NEW_DIR,
    urlsFile: DEFAULT_URLS_FILE,
    rewriteMapFile: existsSync(DEFAULT_REWRITE_MAP) ? DEFAULT_REWRITE_MAP : null,
    rewriteMapExplicit: false,
    outFile: null,
    limit: Infinity,
    filter: "",
    legacyOrigin: DEFAULT_LEGACY_ORIGIN,
    newOrigin: DEFAULT_NEW_ORIGIN,
    failOnError: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eqIdx = arg.indexOf("=");
    const key = eqIdx >= 0 ? arg.slice(0, eqIdx) : arg;
    const nextVal = () => {
      if (eqIdx >= 0) return arg.slice(eqIdx + 1);
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${key}`);
      return argv[++i];
    };

    switch (key) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "--legacy":
        opts.legacyDir = resolve(nextVal());
        break;
      case "--new":
        opts.newDir = resolve(nextVal());
        break;
      case "--urls":
        opts.urlsFile = resolve(nextVal());
        break;
      case "--rewrite-map":
        opts.rewriteMapFile = resolve(nextVal());
        opts.rewriteMapExplicit = true;
        break;
      case "--out":
        opts.outFile = resolve(nextVal());
        break;
      case "--limit": {
        const raw = nextVal();
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`--limit must be a positive integer (got ${raw})`);
        }
        opts.limit = n;
        break;
      }
      case "--filter":
        opts.filter = nextVal();
        break;
      case "--legacy-origin":
        opts.legacyOrigin = nextVal();
        break;
      case "--new-origin":
        opts.newOrigin = nextVal();
        break;
      case "--fail-on-error":
        opts.failOnError = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

export function formatSummaryTable(report) {
  const s = report.summary;
  const rows = [
    ["Total posts checked", String(s.total)],
    ["OK (exact match)", String(s.ok)],
    ["Expected-only diff", String(s.expected)],
    ["Warn", String(s.warn)],
    ["Error", String(s.error)],
    ["Missing files", `${s.missingFiles} (legacy=${s.missingLegacy}, new=${s.missingNew})`],
    ["Duration", `${s.durationMs} ms`],
  ];

  const labelWidth = Math.max(...rows.map(([k]) => k.length));
  const valueWidth = Math.max(...rows.map(([, v]) => v.length));
  const hr = `+${"-".repeat(labelWidth + 2)}+${"-".repeat(valueWidth + 2)}+`;

  const lines = [
    "MIG-4 DOM Parity Summary",
    hr,
    ...rows.map(([k, v]) => `| ${k.padEnd(labelWidth)} | ${v.padStart(valueWidth)} |`),
    hr,
  ];

  const nonZeroFields = Object.entries(s.flaggedFieldCounts ?? {}).filter(([, count]) => count > 0);
  if (nonZeroFields.length > 0) {
    lines.push(
      `Flagged fields: ${nonZeroFields.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }

  if (report.flagged.length > 0) {
    lines.push("Top flagged posts:");
    for (const item of report.flagged.slice(0, 10)) {
      lines.push(
        `  [${item.severity.toUpperCase()}] ${item.url} (${item.flaggedFields.join(", ")})`,
      );
    }
    if (report.flagged.length > 10) {
      lines.push(`  ... and ${report.flagged.length - 10} more`);
    }
  }

  return lines.join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(formatHelp());
    return 0;
  }

  if (!existsSync(opts.urlsFile)) {
    throw new Error(`URLs file not found: ${opts.urlsFile}`);
  }
  if (opts.rewriteMapExplicit && !existsSync(opts.rewriteMapFile)) {
    throw new Error(`Rewrite map file not found: ${opts.rewriteMapFile}`);
  }

  const urlsText = readFileSync(opts.urlsFile, "utf8");
  const urls = filterPostUrls(urlsText, {
    filter: opts.filter,
    limit: opts.limit,
  });

  const rewriteMap =
    opts.rewriteMapFile && existsSync(opts.rewriteMapFile)
      ? JSON.parse(readFileSync(opts.rewriteMapFile, "utf8"))
      : null;

  const report = runBulkDiff({
    legacyDir: opts.legacyDir,
    newDir: opts.newDir,
    urls,
    rewriteMap,
    legacyOrigin: opts.legacyOrigin,
    newOrigin: opts.newOrigin,
    meta: {
      legacyDir: opts.legacyDir,
      newDir: opts.newDir,
      urlsFile: opts.urlsFile,
      rewriteMapFile: rewriteMap ? opts.rewriteMapFile : null,
      filter: opts.filter || null,
      limit: Number.isFinite(opts.limit) ? opts.limit : null,
      legacyOrigin: opts.legacyOrigin,
      newOrigin: opts.newOrigin,
    },
  });

  process.stdout.write(`${formatSummaryTable(report)}\n`);

  if (opts.outFile) {
    mkdirSync(dirname(opts.outFile), { recursive: true });
    writeFileSync(opts.outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`Report written to ${opts.outFile}\n`);
  }

  if (opts.failOnError && (report.summary.error > 0 || report.summary.missingFiles > 0)) {
    return 1;
  }
  return 0;
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    const code = main();
    process.exit(code);
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}
