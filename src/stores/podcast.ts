import { atom, map } from "nanostores";
import { delay } from "es-toolkit";
import { POST_COUNT_PER_PAGE } from "@/packages/consts";

const PODCAST_KEY = "podcast";

export interface IPodcastEpisode {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  summary?: string;
  description?: string;
  duration?: string;
  audioUrl?: string;
  image?: string;
}

export const $episodes = map<Record<string, IPodcastEpisode[]>>({});
export const $loading = atom(false);

function getNextPage(key: string): number {
  const episodes = $episodes.get()[key] ?? [];
  return Math.floor(episodes.length / POST_COUNT_PER_PAGE);
}

async function* streamEpisodes(url: string) {
  const response = await fetch(url);
  if (response.status >= 400) return;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        yield JSON.parse(line) as IPodcastEpisode;
      } catch {
        // skip invalid lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as IPodcastEpisode;
    } catch {
      // skip
    }
  }
}

export async function streamPodcastEpisodes() {
  $loading.set(true);
  const page = getNextPage(PODCAST_KEY);
  const url = `/api/podcast/${page}.ndjson`;

  let current = $episodes.get()[PODCAST_KEY] ?? [];
  const ids = new Set(current.map((e) => e.id));

  for await (const episode of streamEpisodes(url)) {
    await delay(100);
    if (!ids.has(episode.id)) {
      ids.add(episode.id);
      current = [...current, episode];
      $episodes.setKey(PODCAST_KEY, current);
    }
  }

  $loading.set(false);
}
