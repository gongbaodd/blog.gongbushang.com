import { runPythonEmbedding } from "./run-python-embedding.ts";
import type { EmbeddingOptions } from "./types.ts";

export async function getEmbedding(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  return runPythonEmbedding(text, options);
}
