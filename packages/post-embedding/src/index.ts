export {
  DEFAULT_API_KEY,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  EMBEDDING_DIMENSIONS,
  createEmbeddingClient,
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
} from "./client.ts";
export { getEmbedding } from "./get-embedding.ts";
export { isEmbeddingServerRunning } from "./is-embedding-server-running.ts";
export type { EmbeddingOptions } from "./types.ts";
