// Embedding stage: only posts/episodes whose content_hash (or model) changed are embedded; everything else comes from the cache.
// Supports Cloudflare Workers AI (@cf/qwen/qwen3-embedding-0.6b, preferred in `auto` when configured)
// and the legacy local embedder (LM Studio via metadata-embedding `embedFromText`).
// Cache rows are keyed by `model`, so a provider switch makes every row stale. That is handled in one run:
//   - the whole corpus is re-embedded (about 2.2k of the 10k free neurons/day), no chunking, no DERIVE_EMBED_MAX;
//   - if the run cannot finish (quota 429, outage, DERIVE_EMBED=skip, no provider), items whose content_hash still
//     matches keep their old-model vector for relates/UMAP (a warning says so). A provider switch never shrinks the corpus.
// Quota/429 after retries is "missing", not a failure (D10), unless DERIVE_EMBED=require.
// Both providers get the same text as legacy (newlines become spaces, packages/embedding/src/embedding/embed.py);
// Workers AI inputs are capped at ~6k estimated tokens (model context is 8,192), see embed-workers-ai.ts.
// Also used for podcast episodes (`table = "podcast_embeddings"`).
import { createHash } from "node:crypto";
import type pg from "pg";
import { embedFromText } from "../../../../packages/metadata-embedding/src/embedding.ts";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS, resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { isEmbeddingServerRunning } from "../../../../packages/post-embedding/src/is-embedding-server-running.ts";
import { embeddingIndex, loadEmbeddings, upsertEmbedding, type EmbeddingTable } from "./cache.ts";
import {
	DEFAULT_WORKERS_AI_BATCH_SIZE,
	WORKERS_AI_EMBED_MODEL,
	WorkersAiError,
	embedBatchWorkersAi,
	isWorkersAiConfigured,
	normalizeEmbeddingInput,
	validateEmbedModel,
} from "./embed-workers-ai.ts";

/** Anything with an embedding input text: posts and podcast episodes. */
export interface Embeddable {
	legacyId: string;
	embeddingText: string;
	/** sha256 of embeddingText: the cache key. */
	contentHash: string;
}

export type EmbedMode = "auto" | "require" | "skip" | "fake";
export type EmbedProvider = "auto" | "workers-ai" | "local";
export type ResolvedEmbedProvider = "workers-ai" | "local" | "fake";

export interface EmbedPostsOptions {
	concurrency?: number;
	provider?: EmbedProvider;
	/** Override model key (env: DERIVE_EMBED_MODEL; for local also EMBEDDING_MODEL). */
	model?: string;
	/** Batch size per Workers AI request (default 16). */
	batchSize?: number;
	/** Estimated-token cap for Workers AI inputs (default 6000). */
	maxInputTokens?: number;
	/** Max retries for Workers AI 429/5xx responses. */
	maxRetries?: number;
	/** Base backoff delay (ms) for Workers AI retries. */
	baseDelayMs?: number;
	/** Env override for tests (default process.env). */
	env?: NodeJS.ProcessEnv;
	/** Injectable dependencies for tests. */
	fetchFn?: typeof fetch;
	sleepFn?: (ms: number) => Promise<void>;
	checkLocalServer?: () => Promise<boolean>;
	embedLocal?: (text: string) => Promise<number[]>;
}

export interface EmbedResult {
	vectors: Map<string, number[]>;
	model: string;
	provider: ResolvedEmbedProvider;
	reused: number;
	embedded: string[];
	/** Items that need an embedding but have no vector at all (unavailable, skip mode, quota, or new/edited text). */
	missing: string[];
	/** Items not re-embedded under `model` but kept in the corpus with their old-model vector (same content_hash). */
	staleModel: string[];
	/** Items whose input was cut to fit the model context (Workers AI). */
	truncated: string[];
	seconds: number;
}

export function parseEmbedProvider(raw?: string): EmbedProvider {
	const v = raw?.trim();
	if (!v || v === "auto") return "auto";
	if (v === "workers-ai" || v === "local") return v;
	throw new Error(`Invalid DERIVE_EMBED_PROVIDER "${v}": expected "auto", "workers-ai", or "local".`);
}

export function resolveEmbedTarget(
	providerPref: EmbedProvider,
	env: NodeJS.ProcessEnv = process.env,
	explicitModel?: string,
): { provider: "workers-ai" | "local"; model: string } {
	const useWorkersAi = providerPref === "workers-ai" || (providerPref === "auto" && isWorkersAiConfigured(env));
	if (useWorkersAi) {
		const model = explicitModel?.trim() || env.DERIVE_EMBED_MODEL?.trim() || WORKERS_AI_EMBED_MODEL;
		return { provider: "workers-ai", model: validateEmbedModel(model) };
	}
	const localDefault = env === process.env ? resolveModel() : env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
	const model = explicitModel?.trim() || env.DERIVE_EMBED_MODEL?.trim() || localDefault;
	return { provider: "local", model: validateEmbedModel(model) };
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

export async function embedPosts(
	c: pg.Client,
	posts: Embeddable[],
	mode: EmbedMode,
	optionsOrConcurrency: number | EmbedPostsOptions = 3,
	table: EmbeddingTable = "post_embeddings",
): Promise<EmbedResult> {
	const t0 = Date.now();
	const noun = table === "post_embeddings" ? "post" : "episode";
	const opts: EmbedPostsOptions = typeof optionsOrConcurrency === "number" ? { concurrency: optionsOrConcurrency } : optionsOrConcurrency;
	const env = opts.env ?? process.env;
	const concurrency = opts.concurrency ?? 3;
	const batchSize = opts.batchSize ?? DEFAULT_WORKERS_AI_BATCH_SIZE;
	const providerPref = opts.provider ?? parseEmbedProvider(env.DERIVE_EMBED_PROVIDER);
	if (env.DERIVE_EMBED_MAX?.trim()) {
		console.warn("[derive] DERIVE_EMBED_MAX is no longer supported and is ignored: a provider switch re-embeds the whole corpus in one run.");
	}

	const target = resolveEmbedTarget(providerPref, env, opts.model);
	const model = target.model;
	const provider: ResolvedEmbedProvider = mode === "fake" ? "fake" : target.provider;

	const index = await embeddingIndex(c, table);
	const stale = posts.filter((p) => {
		const row = index.get(p.legacyId);
		return !row || row.contentHash !== p.contentHash || row.model !== model;
	});
	const embedded: string[] = [];
	const truncated: string[] = [];
	let notAttempted: Embeddable[] = [];

	const list = (ids: string[]) => `${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`;

	if (stale.length) {
		const runSingleEmbedder = async (embed: (text: string) => Promise<number[]>) => {
			const queue = [...stale];
			const worker = async () => {
				for (let p = queue.shift(); p; p = queue.shift()) {
					const v = await embed(normalizeEmbeddingInput(p.embeddingText));
					if (v.length !== EMBEDDING_DIMENSIONS) {
						throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
					}
					await upsertEmbedding(c, p.legacyId, p.contentHash, model, v, table);
					embedded.push(p.legacyId);
					console.log(`[derive] embedded ${noun} ${p.legacyId}`);
				}
			};
			await Promise.all(Array.from({ length: Math.min(concurrency, stale.length) }, worker));
		};

		if (mode === "fake") {
			console.warn(`[derive] DERIVE_EMBED=fake: using pseudo embeddings for ${stale.length} ${noun}(s) (test only)`);
			await runSingleEmbedder(async (t) => fakeEmbedding(t));
		} else if (mode === "skip") {
			notAttempted = stale;
			console.warn(`[derive] DERIVE_EMBED=skip: ${stale.length} ${noun}(s) not embedded`);
		} else if (target.provider === "workers-ai") {
			if (isWorkersAiConfigured(env)) {
				let offset = 0;
				try {
					for (; offset < stale.length; offset += batchSize) {
						const batch = stale.slice(offset, offset + batchSize);
						const vectors = await embedBatchWorkersAi(
							batch.map((p) => p.embeddingText),
							{
								model,
								batchSize: batch.length,
								maxInputTokens: opts.maxInputTokens,
								maxRetries: opts.maxRetries,
								baseDelayMs: opts.baseDelayMs,
								env,
								fetchFn: opts.fetchFn,
								sleepFn: opts.sleepFn,
								onTruncate: (i) => {
									const id = batch[i]!.legacyId;
									if (!truncated.includes(id)) truncated.push(id);
								},
							},
						);
						for (let i = 0; i < batch.length; i++) {
							const p = batch[i]!;
							const v = vectors[i]!;
							if (v.length !== EMBEDDING_DIMENSIONS) {
								throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
							}
							await upsertEmbedding(c, p.legacyId, p.contentHash, model, v, table);
							embedded.push(p.legacyId);
							console.log(`[derive] embedded ${noun} ${p.legacyId} (workers-ai)`);
						}
					}
				} catch (e) {
					if (!(e instanceof WorkersAiError) || mode === "require") throw e;
					// Quota / outage after retries: graceful (D10). Remaining items keep their old vector if they have one.
					notAttempted = stale.slice(offset);
					console.warn(
						`[derive] WARNING: Workers AI ${e.kind} (${e.message}); ${notAttempted.length} ${noun}(s) not embedded, the rest of the corpus is unaffected. Re-run derive later (cached vectors are kept).`,
					);
				}
			} else if (mode === "require") {
				throw new Error(
					`${stale.length} ${noun}(s) need embeddings with provider "workers-ai", but Cloudflare Workers AI credentials are not configured (set CF_ACCOUNT_ID and CF_AI_TOKEN).`,
				);
			} else {
				notAttempted = stale;
				console.warn(`[derive] WARNING: Cloudflare Workers AI credentials not configured (set CF_ACCOUNT_ID and CF_AI_TOKEN); ${stale.length} ${noun}(s) not embedded.`);
			}
		} else {
			const checkLocal = opts.checkLocalServer ?? isEmbeddingServerRunning;
			if (await checkLocal()) {
				const embedLocal = opts.embedLocal ?? ((t: string) => embedFromText(t, { model }));
				await runSingleEmbedder(embedLocal);
			} else if (mode === "require") {
				const hint =
					providerPref === "auto"
						? `configure Cloudflare Workers AI (CF_ACCOUNT_ID / CF_AI_TOKEN) or start LM Studio with ${model}`
						: `start LM Studio with ${model}, run "pnpm embedding:sync"`;
				throw new Error(`${stale.length} ${noun}(s) need embeddings but no embedding provider is available (${hint}).`);
			} else {
				notAttempted = stale;
				console.warn(`[derive] WARNING: embedding server not running; ${stale.length} ${noun}(s) not embedded.`);
			}
		}
	}

	// Keep every vector whose text still matches, even if another model made it: a provider switch never shrinks the corpus.
	const valid = new Map<string, { contentHash: string; model: string }>();
	for (const p of posts) valid.set(p.legacyId, { contentHash: p.contentHash, model });
	const vectors = await loadEmbeddings(c, valid, table, true);
	const missing = notAttempted.filter((p) => !vectors.has(p.legacyId)).map((p) => p.legacyId);
	const staleModel = notAttempted.filter((p) => vectors.has(p.legacyId)).map((p) => p.legacyId);
	if (staleModel.length) {
		console.warn(`[derive] WARNING: ${staleModel.length} ${noun}(s) keep a vector from a previous embedding model (not re-embedded as ${model}): ${list(staleModel)}`);
	}
	if (missing.length) {
		console.warn(
			`[derive] WARNING: ${missing.length} ${noun}(s) have no embedding; they are left out of related posts and /umap until "pnpm --filter web derive" runs with an embedding provider available: ${list(missing)}`,
		);
	}
	if (truncated.length) {
		console.warn(`[derive] ${truncated.length} ${noun}(s) exceeded the embedding context and were truncated before embedding: ${list(truncated)}`);
	}
	return { vectors, model, provider, reused: posts.length - stale.length, embedded, missing, staleModel, truncated, seconds: (Date.now() - t0) / 1000 };
}
