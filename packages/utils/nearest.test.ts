import { describe, expect, test } from "vitest";
import { cosineDistance, findNearest, type INearestCandidate } from "./nearest";

const tech = { label: "tech" };
const life = { label: "life" };

function post(id: string, extra: Partial<INearestCandidate> = {}): INearestCandidate {
  return { id, category: tech, ...extra };
}

const ids = (posts: INearestCandidate[]) => posts.map((p) => p.id);

describe("cosineDistance", () => {
  test("is 0 for identical direction and 1 for orthogonal vectors", () => {
    expect(cosineDistance([1, 2], [2, 4])).toBeCloseTo(0);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
  });

  test("treats zero vectors as far", () => {
    expect(cosineDistance([0, 0], [1, 1])).toBe(1);
  });
});

describe("findNearest", () => {
  const target = post("t", { embeddings: [1, 0] });

  test("excludes the target and other categories", () => {
    const result = findNearest(
      target,
      [
        target,
        post("a", { embeddings: [1, 0] }),
        post("b", { category: life, embeddings: [1, 0] }),
      ],
      8,
    );
    expect(ids(result)).toEqual(["a"]);
  });

  test("orders by embedding similarity and respects limit", () => {
    const result = findNearest(
      target,
      [
        post("far", { embeddings: [0, 1] }),
        post("near", { embeddings: [1, 0.1] }),
        post("mid", { embeddings: [1, 1] }),
      ],
      2,
    );
    expect(ids(result)).toEqual(["near", "mid"]);
  });

  test("short target only relates to short posts", () => {
    const shortTarget = post("t", { isShort: true, embeddings: [1, 0] });
    const result = findNearest(
      shortTarget,
      [
        post("long-near", { embeddings: [1, 0] }),
        post("short-far", { isShort: true, embeddings: [0, 1] }),
      ],
      8,
    );
    expect(ids(result)).toEqual(["short-far"]);
  });

  test("long target still sees short posts", () => {
    const result = findNearest(target, [post("s", { isShort: true, embeddings: [1, 0] })], 8);
    expect(ids(result)).toEqual(["s"]);
  });

  test("falls back to umap2D, then unranked posts", () => {
    const t = post("t", { umap2D: [0, 0] });
    const result = findNearest(
      t,
      [post("none"), post("umap-far", { umap2D: [5, 5] }), post("umap-near", { umap2D: [1, 0] })],
      8,
    );
    expect(ids(result)).toEqual(["umap-near", "umap-far", "none"]);
  });

  test("embedding matches rank before umap-only matches", () => {
    const t = post("t", { embeddings: [1, 0], umap2D: [0, 0] });
    const result = findNearest(
      t,
      [post("umap", { umap2D: [0, 0] }), post("emb", { embeddings: [0, 1] })],
      8,
    );
    expect(ids(result)).toEqual(["emb", "umap"]);
  });
});
