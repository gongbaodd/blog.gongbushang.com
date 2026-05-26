import { createEmbeddingClient, EMBEDDING_DIMENSIONS, resolveModel } from "./client.ts";
import type { EmbeddingOptions } from "./types.ts";

const PROBE_TEXT = "ping";

export async function isEmbeddingServerRunning(
  options?: EmbeddingOptions,
): Promise<boolean> {
  try {
    const client = createEmbeddingClient(options);
    const model = resolveModel(options);
    const response = await client.embeddings.create({
      input: [PROBE_TEXT],
      model,
    });
    const embedding = response.data[0]?.embedding;

    console.log("embedding", embedding);
    console.log("embedding length", embedding?.length);
    console.log("embedding dimensions", EMBEDDING_DIMENSIONS);
    return embedding?.length === EMBEDDING_DIMENSIONS;
  } catch (error) {
    return false;
  }
}
