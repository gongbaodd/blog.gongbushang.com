import OpenAI from "openai";
import type { EmbeddingOptions } from "./types.ts";

export const DEFAULT_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_API_KEY = "lm-studio";
export const DEFAULT_MODEL = "text-embedding-nomic-embed-text-v1.5";
export const EMBEDDING_DIMENSIONS = 768;

export function resolveBaseUrl(options?: EmbeddingOptions): string {
  return options?.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? DEFAULT_BASE_URL;
}

export function resolveApiKey(options?: EmbeddingOptions): string {
  return options?.apiKey ?? process.env.EMBEDDING_API_KEY ?? DEFAULT_API_KEY;
}

export function resolveModel(options?: EmbeddingOptions): string {
  return options?.model ?? process.env.EMBEDDING_MODEL ?? DEFAULT_MODEL;
}

export function createEmbeddingClient(options?: EmbeddingOptions): OpenAI {
  return new OpenAI({
    baseURL: resolveBaseUrl(options),
    apiKey: resolveApiKey(options),
  });
}
