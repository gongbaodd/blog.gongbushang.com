// Embedding stage: only posts whose content_hash (or model) changed are embedded; everything else comes from the cache.
// The embedder is the legacy one (metadata-embedding `embedFromText` -> uv python -> LM Studio, model
// text-embedding-qwen3-embedding-0.6b), so cached and fresh vectors are comparable.
import { createHash } from "node:crypto";
import type pg from "pg";
import { embedFromText } from "../../../../packages/metadata-embedding/src/embedding.ts";
import { EMBEDDING_DIMENSIONS, resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { isEmbeddingServerRunning } from "../../../../packages/post-embedding/src/is-embedding-server-running.ts";
import { embeddingIndex, loadEmbeddings, upsertEmbedding } from "./cache.ts";
import type { DerivedPost } from "./posts.ts";

export type EmbedMode = "auto" | "require" | "skip" | "fake";

export interface EmbedResult {
	vectors: Map<string, number[]>;
	model: string;
	reused: number;
	embedded: string[];
	/** Posts that need an embedding but could not get one (embedding server unavailable, or skip mode). */
	missing: string[];
	seconds: number;
}

/** Test-only deterministic pseudo-embedding (DERIVE_EMBED=fake). Never use against a real cache schema. */
export function fakeEmbedding(text: string): number[] {
	let x = BigInt("0x" + createHash("sha256").update(text).digest("hex").slice(0, 16)) | 1n;
	const out: number[] = [];
	let norm = 0;
	for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
		x ^= (x << 13n) & 0xffffffffffffffffn;
		x ^= x >> 7n;
		x ^= (x << 17n) & 0xffffffffffffffffn;
		const f = Math.fround(Number(x % 2000001n) / 1000000 - 1);
		out.push(f);
		norm += f * f;
	}
	return out.map((f) => Math.fround(f / Math.sqrt(norm)));
}

export async function embedPosts(c: pg.Client, posts: DerivedPost[], mode: EmbedMode, concurrency = 3): Promise<EmbedResult> {
	const t0 = Date.now();
	const model = resolveModel();
	const index = await embeddingIndex(c);
	const stale = posts.filter((p) => {
		const row = index.get(p.legacyId);
		return !row || row.contentHash !== p.contentHash || row.model !== model;
	});
	const embedded: string[] = [];
	let missing: string[] = [];

	if (stale.length) {
		let embed: ((text: string) => Promise<number[]>) | undefined;
		if (mode === "fake") {
			console.warn(`[derive] DERIVE_EMBED=fake: using pseudo embeddings for ${stale.length} post(s) (test only)`);
			embed = async (t) => fakeEmbedding(t);
		} else if (mode !== "skip") {
			if (await isEmbeddingServerRunning()) embed = (t) => embedFromText(t);
			else if (mode === "require") {
				throw new Error(`${stale.length} post(s) need embeddings but the embedding server is not running (start LM Studio with ${model}, run "pnpm embedding:sync").`);
			}
		}
		if (embed) {
			const queue = [...stale];
			const worker = async () => {
				for (let p = queue.shift(); p; p = queue.shift()) {
					const v = await embed(p.embeddingText);
					if (v.length !== EMBEDDING_DIMENSIONS) throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
					await upsertEmbedding(c, p.legacyId, p.contentHash, model, v);
					embedded.push(p.legacyId);
					console.log(`[derive] embedded ${p.legacyId}`);
				}
			};
			await Promise.all(Array.from({ length: Math.min(concurrency, stale.length) }, worker));
		} else {
			missing = stale.map((p) => p.legacyId);
			console.warn(
				`[derive] WARNING: ${missing.length} post(s) have no embedding (${mode === "skip" ? "DERIVE_EMBED=skip" : "embedding server not running"}); they are left out of related posts and /umap until "pnpm --filter web derive" runs where the embedding model is available: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
			);
		}
	}

	const valid = new Map<string, { contentHash: string; model: string }>();
	for (const p of posts) valid.set(p.legacyId, { contentHash: p.contentHash, model });
	const vectors = await loadEmbeddings(c, valid);
	return { vectors, model, reused: posts.length - stale.length, embedded, missing, seconds: (Date.now() - t0) / 1000 };
}
