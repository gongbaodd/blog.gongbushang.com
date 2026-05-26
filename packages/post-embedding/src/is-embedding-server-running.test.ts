import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockGetEmbedding = vi.fn();

vi.mock("./get-embedding.ts", () => ({
  getEmbedding: (...args: unknown[]) => mockGetEmbedding(...args),
}));

import { isEmbeddingServerRunning } from "./is-embedding-server-running.ts";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS } from "./client.ts";

function mockEmbeddingVector(length = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length }, (_, i) => i * 0.001);
}

describe("isEmbeddingServerRunning", () => {
  beforeEach(() => {
    mockGetEmbedding.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns true when the Python embedding package responds with expected dimensions", async () => {
    mockGetEmbedding.mockResolvedValue(mockEmbeddingVector());

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(true);
    expect(mockGetEmbedding).toHaveBeenCalledWith("ping", undefined);
  });

  test("returns false when the embedding vector has unexpected dimensions", async () => {
    mockGetEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(false);
  });

  test("returns false when the Python embedding package is unreachable", async () => {
    mockGetEmbedding.mockRejectedValue(new Error("Connection refused"));

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(false);
  });

  test("uses custom model for the probe request", async () => {
    mockGetEmbedding.mockResolvedValue(mockEmbeddingVector());

    await isEmbeddingServerRunning({ model: "custom-model" });

    expect(mockGetEmbedding).toHaveBeenCalledWith("ping", {
      model: "custom-model",
    });
  });

  test("uses the configured default model", () => {
    expect(DEFAULT_MODEL).toBe("text-embedding-qwen3-embedding-0.6b");
  });
});
