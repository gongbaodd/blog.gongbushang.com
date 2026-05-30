import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPodcastEmbeddingText,
  embedFromText,
  UMAP_STATE_FILENAME,
} from "metadata-embedding";
import type { EmbeddingOptions } from "post-embedding";
import type { Episode } from "./types.ts";

async function readEpisodeFile(filePath: string): Promise<Episode> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as Episode;
}

export async function syncEpisodeEmbeddings(
  traceDir: string,
  options?: {
    embeddingOptions?: EmbeddingOptions;
    episodeIds?: Set<string>;
  },
): Promise<number> {
  let files: string[];
  try {
    files = await fs.readdir(traceDir);
  } catch {
    return 0;
  }

  let updated = 0;
  const onlyIds = options?.episodeIds;

  for (const file of files.filter(
    (name) =>
      name.endsWith(".json") &&
      !name.startsWith(".") &&
      name !== UMAP_STATE_FILENAME,
  )) {
    const filePath = path.join(traceDir, file);
    const episode = await readEpisodeFile(filePath);

    if (onlyIds && !onlyIds.has(episode.id)) {
      continue;
    }

    const needsEmbedding =
      !Array.isArray(episode.embeddings) || episode.embeddings.length === 0;

    if (!needsEmbedding) {
      continue;
    }

    const text = buildPodcastEmbeddingText({
      title: episode.title,
      summary: episode.summary,
    });
    episode.embeddings = await embedFromText(text, options?.embeddingOptions);

    await fs.writeFile(filePath, JSON.stringify(episode, null, 2), "utf-8");
    updated++;
    console.log(`🧠 Embedded podcast episode: ${episode.title}`);
  }

  return updated;
}
