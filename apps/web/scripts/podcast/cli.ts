// `pnpm fetch:podcast -- --emdash <admin url> [--rss-url <url>] [--dry-run]`: create RSS episodes missing from EmDash.
// The legacy JSON mode (writing src/content/generated) was removed in CUT-2c with the legacy site.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAndProcessPodcast } from "./fetch-podcast.ts";

export interface CliOptions {
  rssUrl?: string;
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
    } else if (arg === "--emdash" && next) {
      options.emdash = next;
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const cli = parseCliArgs(argv);
  if (!cli.emdash) {
    console.error("❌ Missing --emdash <admin url> (for example http://127.0.0.1:4322).");
    process.exit(1);
  }
  try {
    await fetchAndProcessPodcast({ rssUrl: cli.rssUrl, emdash: { url: cli.emdash, dryRun: cli.dryRun } });
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
