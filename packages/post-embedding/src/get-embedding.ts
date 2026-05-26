import { createEmbeddingClient, resolveModel } from "./client.ts";
import type { EmbeddingOptions } from "./types.ts";

export async function getEmbedding(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  const normalized = text.replace(/\n/g, " ");
  const client = createEmbeddingClient(options);
  const model = resolveModel(options);
  const response = await client.embeddings.create({
    input: [normalized],
    model,
  });
  return response.data[0].embedding;
}
