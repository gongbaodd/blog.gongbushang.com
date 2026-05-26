import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("./client.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client.ts")>();
  return {
    ...actual,
    createEmbeddingClient: vi.fn(() => ({
      embeddings: { create: mockCreate },
    })),
  };
});

import { isEmbeddingServerRunning } from "./is-embedding-server-running.ts";
import { createEmbeddingClient, DEFAULT_MODEL, EMBEDDING_DIMENSIONS } from "./client.ts";

function mockEmbeddingVector(length = EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length }, (_, i) => i * 0.001);
}

describe("isEmbeddingServerRunning", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(createEmbeddingClient).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("returns true when the embedding server responds with 768 dimensions", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: mockEmbeddingVector() }],
    });

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith({
      input: ["ping"],
      model: DEFAULT_MODEL,
    });
  });

  test("returns false when the embedding vector is not 768 dimensions", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(false);
  });

  test("returns false when the embedding server is unreachable", async () => {
    mockCreate.mockRejectedValue(new Error("Connection refused"));

    const result = await isEmbeddingServerRunning();

    expect(result).toBe(false);
  });

  test("forwards baseUrl and apiKey to createEmbeddingClient", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: mockEmbeddingVector() }],
    });

    await isEmbeddingServerRunning({
      baseUrl: "http://example.com/v1",
      apiKey: "test-key",
    });

    expect(createEmbeddingClient).toHaveBeenCalledWith({
      baseUrl: "http://example.com/v1",
      apiKey: "test-key",
    });
  });

  test("uses custom model for the probe request", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: mockEmbeddingVector() }],
    });

    await isEmbeddingServerRunning({ model: "custom-model" });

    expect(mockCreate).toHaveBeenCalledWith({
      input: ["ping"],
      model: "custom-model",
    });
  });
});
