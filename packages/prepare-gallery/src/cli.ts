import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GALLERY_JSON, GALLERY_TRACE_DIR } from "consts/config.js";

export async function findRepoRoot(startDir = process.cwd()): Promise<string> {
  let dir = startDir;
  while (true) {
    try {
      const pkgPath = path.join(dir, "package.json");
      const raw = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name === "gongbaodd-blog") {
        return dir;
      }
    } catch {
      // keep walking up
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
}

export interface CliOptions {
  galleryDir?: string;
  output?: string;
  traceDir?: string;
  depth?: boolean;
  regenerateTraces?: boolean;
  tracesOnly?: boolean;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--gallery-dir" && next) {
      options.galleryDir = next;
      i++;
    } else if (arg === "--output" && next) {
      options.output = next;
      i++;
    } else if (arg === "--trace-dir" && next) {
      options.traceDir = next;
      i++;
    } else if (arg === "--depth") {
      options.depth = true;
    } else if (arg === "--regenerate-traces") {
      options.regenerateTraces = true;
    } else if (arg === "--traces-only") {
      options.tracesOnly = true;
    }
  }
  return options;
}

export async function resolveCollectOptions(cli: CliOptions = {}) {
  const repoRoot = await findRepoRoot();
  return {
    galleryDir: path.resolve(
      repoRoot,
      cli.galleryDir ?? "src/content/_gallery",
    ),
    outputFile: path.resolve(repoRoot, cli.output ?? GALLERY_JSON),
    traceDir: path.resolve(repoRoot, cli.traceDir ?? GALLERY_TRACE_DIR),
    baseDir: repoRoot,
    useDepthPrep: cli.depth ?? false,
    regenerateTraces: cli.regenerateTraces ?? false,
    tracesOnly: cli.tracesOnly ?? false,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  const options = await resolveCollectOptions(cli);
  const { collectGallery } = await import("./collect-gallery.ts");
  await collectGallery(options);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  });
}
