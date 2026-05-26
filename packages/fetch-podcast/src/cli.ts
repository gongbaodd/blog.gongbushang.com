import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndProcessPodcast } from "./fetch-podcast.ts";

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
  rssUrl?: string;
  output?: string;
  traceDir?: string;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--rss-url" && next) {
      options.rssUrl = next;
      i++;
    } else if (arg === "--output" && next) {
      options.output = next;
      i++;
    } else if (arg === "--trace-dir" && next) {
      options.traceDir = next;
      i++;
    }
  }
  return options;
}

export async function resolveFetchOptions(cli: CliOptions = {}) {
  const repoRoot = await findRepoRoot();
  return {
    rssUrl: cli.rssUrl,
    outputFile: path.resolve(
      repoRoot,
      cli.output ?? "src/content/podcast.json",
    ),
    traceDir: path.resolve(repoRoot, cli.traceDir ?? "src/content/podcast"),
    baseDir: repoRoot,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  const options = await resolveFetchOptions(cli);
  try {
    await fetchAndProcessPodcast(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Error fetching podcast:", message);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runCli();
}
