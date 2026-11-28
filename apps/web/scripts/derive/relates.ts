// Nearest-neighbour "related posts": the same algorithm as the legacy packages/utils/nearest.ts
// (cosine distance on embeddings, then UMAP distance, then the rest; same category; short posts relate to short posts).
export const RELATES_LIMIT = 8; // POST_COUNT_PER_PAGE / 2

export interface Candidate {
	id: string;
	category?: { label: string };
	isShort?: boolean;
	embeddings?: number[];
	umap2D?: [number, number];
}

export function cosineDistance(a: number[], b: number[]): number {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!;
		na += a[i]! * a[i]!;
		nb += b[i]! * b[i]!;
	}
	if (na === 0 || nb === 0) return 1;
	return 1 - dot / Math.sqrt(na * nb);
}

const has = (e: Candidate, len?: number) => Array.isArray(e.embeddings) && e.embeddings.length > 0 && (len === undefined || e.embeddings.length === len);

export function findNearest<T extends Candidate>(target: T, candidates: T[], limit: number): T[] {
	const pool = candidates.filter((c) => c.id !== target.id && c.category?.label === target.category?.label && (!target.isShort || c.isShort === true));
	const dims = has(target) ? target.embeddings!.length : undefined;
	const byE: { item: T; d: number }[] = [], byU: { item: T; d: number }[] = [], rest: T[] = [];
	for (const item of pool) {
		if (dims !== undefined && has(item, dims)) byE.push({ item, d: cosineDistance(target.embeddings!, item.embeddings!) });
		else if (target.umap2D && item.umap2D) byU.push({ item, d: Math.hypot(target.umap2D[0] - item.umap2D[0], target.umap2D[1] - item.umap2D[1]) });
		else rest.push(item);
	}
	const by = (a: { d: number }, b: { d: number }) => a.d - b.d;
	return [...byE.sort(by).map((x) => x.item), ...byU.sort(by).map((x) => x.item), ...rest].slice(0, limit);
}
