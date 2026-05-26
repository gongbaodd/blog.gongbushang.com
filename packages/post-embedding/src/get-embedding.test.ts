import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_MODEL } from "./client.ts";

const mockRunPythonEmbedding = vi.fn();

vi.mock("./run-python-embedding.ts", () => ({
  runPythonEmbedding: (...args: unknown[]) => mockRunPythonEmbedding(...args),
}));

import { getEmbedding } from "./get-embedding.ts";

describe("getEmbedding", () => {
  beforeEach(() => {
    mockRunPythonEmbedding.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("delegates text to the Python embedding package", async () => {
    mockRunPythonEmbedding.mockResolvedValue([0.1, 0.2]);

    await getEmbedding("a\nb\nc");

    expect(mockRunPythonEmbedding).toHaveBeenCalledWith("a\nb\nc", undefined);
  });

  test("returns the embedding vector from the Python package", async () => {
    const vector = [0.1, 0.2, 0.3];
    mockRunPythonEmbedding.mockResolvedValue(vector);

    const result = await getEmbedding("hello");

    expect(result).toEqual(vector);
  });

  test("uses custom model when provided in options", async () => {
    mockRunPythonEmbedding.mockResolvedValue([1]);

    await getEmbedding("hello", { model: "custom-model" });

    expect(mockRunPythonEmbedding).toHaveBeenCalledWith("hello", {
      model: "custom-model",
    });
  });

  test("exports expected defaults", () => {
    expect(DEFAULT_MODEL).toBe("text-embedding-qwen3-embedding-0.6b");
  });
});
