import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_API_KEY,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} from "./client.ts";

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

import { getEmbedding } from "./get-embedding.ts";
import { createEmbeddingClient } from "./client.ts";

describe("getEmbedding", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    vi.mocked(createEmbeddingClient).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("replaces newlines with spaces before sending", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
    });

    await getEmbedding("a\nb\nc");

    expect(mockCreate).toHaveBeenCalledWith({
      input: ["a b c"],
      model: DEFAULT_MODEL,
    });
  });

  test("returns the embedding vector from the API response", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockCreate.mockResolvedValue({
      data: [{ embedding: vector }],
    });

    const result = await getEmbedding("hello");

    expect(result).toEqual(vector);
  });

  test("uses custom model when provided in options", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [1] }],
    });

    await getEmbedding("hello", { model: "custom-model" });

    expect(mockCreate).toHaveBeenCalledWith({
      input: ["hello"],
      model: "custom-model",
    });
  });

  test("forwards baseUrl and apiKey to createEmbeddingClient", async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: [1] }],
    });

    await getEmbedding("hello", {
      baseUrl: "http://example.com/v1",
      apiKey: "test-key",
    });

    expect(createEmbeddingClient).toHaveBeenCalledWith({
      baseUrl: "http://example.com/v1",
      apiKey: "test-key",
    });
  });

  test("exports expected defaults", () => {
    expect(DEFAULT_BASE_URL).toBe("http://localhost:1234/v1");
    expect(DEFAULT_API_KEY).toBe("lm-studio");
    expect(DEFAULT_MODEL).toBe("text-embedding-nomic-embed-text-v1.5");
  });
});
