import { EMBEDDING_DIMENSIONS } from "./client.ts";
import { getEmbedding } from "./get-embedding.ts";
import type { EmbeddingOptions } from "./types.ts";

const PROBE_TEXT = "ping";

export async function isEmbeddingServerRunning(
  options?: EmbeddingOptions,
): Promise<boolean> {
  try {
    const embedding = await getEmbedding(PROBE_TEXT, options);
    return embedding.length === EMBEDDING_DIMENSIONS;
  } catch {
    return false;
  }
}
