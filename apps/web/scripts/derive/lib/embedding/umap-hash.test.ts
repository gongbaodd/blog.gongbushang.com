import { describe, expect, test } from "vitest";
import { computeUmapInputHash } from "./umap-hash.ts";

describe("computeUmapInputHash", () => {
  test("is stable for the same corpus", () => {
    const corpus = [
      { key: "a/post", embeddings: [0.1, 0.2] },
      { key: "b/post", embeddings: [0.3, 0.4] },
    ];

    expect(computeUmapInputHash(corpus)).toBe(computeUmapInputHash(corpus));
  });

  test("changes when one embedding value changes", () => {
    const before = computeUmapInputHash([
      { key: "a/post", embeddings: [0.1, 0.2] },
      { key: "b/post", embeddings: [0.3, 0.4] },
    ]);
    const after = computeUmapInputHash([
      { key: "a/post", embeddings: [0.1, 0.21] },
      { key: "b/post", embeddings: [0.3, 0.4] },
    ]);

    expect(after).not.toBe(before);
  });

  test("is stable regardless of input order", () => {
    const first = computeUmapInputHash([
      { key: "a/post", embeddings: [0.1, 0.2] },
      { key: "b/post", embeddings: [0.3, 0.4] },
    ]);
    const second = computeUmapInputHash([
      { key: "b/post", embeddings: [0.3, 0.4] },
      { key: "a/post", embeddings: [0.1, 0.2] },
    ]);

    expect(second).toBe(first);
  });
});
