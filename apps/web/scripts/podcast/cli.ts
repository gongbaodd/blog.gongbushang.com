import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PODCAST_COVER_DIR, PODCAST_JSON } from "consts/config.js";
import { fetchAndProcessPodcast } from "./fetch-podcast.ts";

/** Walks up from `startDir` to the directory that holds `pnpm-workspace.yaml` (the monorepo root). */
export async function findRepoRoot(startDir = process.cwd()): Promise<string> {
  let dir = path.resolve(startDir);
  while (true) {
    try {
      await fs.access(path.join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      // keep walking up
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find the repo root: no pnpm-workspace.yaml in ${startDir} or any parent directory.`,
      );
    }
    dir = parent;
  }
}

export interface CliOptions {
  rssUrl?: string;
  output?: string;
  episodeDir?: string;
  emdash?: string;
  dryRun?: boolean;
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
    } else if (arg === "--emdash" && next) {
      options.emdash = next;
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--episode-dir" && next) {
      options.episodeDir = next;
      i++;
    }
  }
  return options;
}

export async function resolveFetchOptions(cli: CliOptions = {}) {
  const repoRoot = await findRepoRoot();
  return {
    rssUrl: cli.rssUrl,
    outputFile: path.resolve(repoRoot, cli.output ?? PODCAST_JSON),
    episodeDir: path.resolve(repoRoot, cli.episodeDir ?? PODCAST_COVER_DIR),
    baseDir: repoRoot,
    ...(cli.emdash ? { emdash: { url: cli.emdash, dryRun: cli.dryRun } } : {}),
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runCli();
}
