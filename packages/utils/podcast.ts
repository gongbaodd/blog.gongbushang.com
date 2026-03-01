import fs from "node:fs";
import path from "node:path";
import data from "../../src/content/podcast.json";

export interface PodcastEpisode extends Record<string, unknown> {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  summary?: string;
  duration?: string;
  audioUrl?: string;
  image?: string;
  colorSet?: {
    bgColor: string;
    titleColor: string;
    trace?: string;
  };
  trace?: string;
}

function episodeSlug(id: string): string {
  const part = id.split("/").pop();
  return part || id.replace(/[^a-zA-Z0-9-]/g, "-");
}

/**
 * Processes podcast data by enriching episodes with trace data from SVG files.
 * Similar to sortPostsByDate, this function transforms raw podcast data into
 * the final podcast data structure.
 *
 * @returns Array of episodes enriched with trace data
 */
export function processPodcastEpisodes(): PodcastEpisode[] {
  const episodesData = (data as { episodes?: Array<Record<string, unknown>> }).episodes ?? [];
  const podcastSvgDir = path.join(process.cwd(), "src", "content", "podcast");

  return episodesData.map((ep) => {
    if (!ep.image) return ep as PodcastEpisode;

    const slug = episodeSlug(ep.id as string);
    const svgPath = path.join(podcastSvgDir, `${slug}.svg`);

    try {
      const trace = fs.readFileSync(svgPath, "utf-8");
      return { ...ep, trace } as PodcastEpisode;
    } catch {
      return ep as PodcastEpisode;
    }
  });
}
