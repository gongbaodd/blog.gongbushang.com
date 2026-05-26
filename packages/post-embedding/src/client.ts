import type { EmbeddingOptions } from "./types.ts";

export const DEFAULT_MODEL = "text-embedding-qwen3-embedding-0.6b";
export const EMBEDDING_DIMENSIONS = 1024;

export function resolveModel(options?: EmbeddingOptions): string {
  return options?.model ?? process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
}
