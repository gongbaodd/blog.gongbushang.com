/**
 * Nearest-neighbour lookup for "More to discover".
 *
 * Candidates must share the target's category. A short target only relates to
 * other short posts. Ranking uses cosine distance on embeddings, falling back
 * to UMAP 2D distance for posts that have no embeddings.
 */
export interface INearestCandidate {
  id: string;
  category: { label: string };
  isShort?: boolean;
  embeddings?: number[];
  umap2D?: [number, number];
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / Math.sqrt(normA * normB);
}

function euclidean2D(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function hasEmbeddings(entry: INearestCandidate, length?: number): boolean {
  return (
    Array.isArray(entry.embeddings) &&
    entry.embeddings.length > 0 &&
    (length === undefined || entry.embeddings.length === length)
  );
}

export function findNearest<T extends INearestCandidate>(
  target: INearestCandidate,
  candidates: T[],
  limit: number,
): T[] {
  const pool = candidates.filter(
    (c) =>
      c.id !== target.id &&
      c.category.label === target.category.label &&
      (!target.isShort || c.isShort === true),
  );

  const dims = hasEmbeddings(target) ? target.embeddings!.length : undefined;
  const byEmbedding: { item: T; d: number }[] = [];
  const byUmap: { item: T; d: number }[] = [];
  const rest: T[] = [];

  for (const item of pool) {
    if (dims !== undefined && hasEmbeddings(item, dims)) {
      byEmbedding.push({ item, d: cosineDistance(target.embeddings!, item.embeddings!) });
    } else if (target.umap2D && item.umap2D) {
      byUmap.push({ item, d: euclidean2D(target.umap2D, item.umap2D) });
    } else {
      rest.push(item);
    }
  }

  const byDistance = (a: { d: number }, b: { d: number }) => a.d - b.d;
  return [
    ...byEmbedding.sort(byDistance).map(({ item }) => item),
    ...byUmap.sort(byDistance).map(({ item }) => item),
    ...rest,
  ].slice(0, limit);
}
