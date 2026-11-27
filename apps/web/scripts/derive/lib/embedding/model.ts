// Embedding model and vector size shared by derive (embed.ts, embed-workers-ai.ts, compare-embeddings.ts).
export const DEFAULT_MODEL = "text-embedding-qwen3-embedding-0.6b";
export const EMBEDDING_DIMENSIONS = 1024;

export function resolveModel(options?: { model?: string }): string {
  return options?.model ?? process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
}
