// Embedding stage: only posts whose content_hash (or model) changed are embedded; everything else comes from the cache.
// Supports Cloudflare Workers AI (@cf/qwen/qwen3-embedding-0.6b, preferred in `auto` when configured)
// and the legacy local embedder (LM Studio via metadata-embedding `embedFromText`).
// Cache rows are keyed by `model`, so Workers AI and local vectors are never silently mixed.
import { createHash } from "node:crypto";
import type pg from "pg";
import { embedFromText } from "../../../../packages/metadata-embedding/src/embedding.ts";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS, resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { isEmbeddingServerRunning } from "../../../../packages/post-embedding/src/is-embedding-server-running.ts";
import { embeddingIndex, loadEmbeddings, upsertEmbedding } from "./cache.ts";
import {
	DEFAULT_WORKERS_AI_BATCH_SIZE,
	WORKERS_AI_EMBED_MODEL,
	embedBatchWorkersAi,
	isWorkersAiConfigured,
} from "./embed-workers-ai.ts";
import type { DerivedPost } from "./posts.ts";

export type EmbedMode = "auto" | "require" | "skip" | "fake";
export type EmbedProvider = "auto" | "workers-ai" | "local";
export type ResolvedEmbedProvider = "workers-ai" | "local" | "fake";

export interface EmbedPostsOptions {
	concurrency?: number;
	provider?: EmbedProvider;
	/** Positive integer cap on how many stale posts to embed in this run (env: DERIVE_EMBED_MAX). */
	maxEmbed?: number;
	/** Override model key (env: DERIVE_EMBED_MODEL for workers-ai; EMBEDDING_MODEL for local). */
	model?: string;
	/** Batch size per Workers AI request (default 16). */
	batchSize?: number;
	/** Defensive character cap for Workers AI inputs. */
	maxInputChars?: number;
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
	/** Posts that need an embedding but could not get one (unavailable, skip mode, or deferred by DERIVE_EMBED_MAX). */
	missing: string[];
	seconds: number;
}

export function parseEmbedProvider(raw?: string): EmbedProvider {
	const v = raw?.trim();
	if (!v || v === "auto") return "auto";
	if (v === "workers-ai" || v === "local") return v;
	throw new Error(`Invalid DERIVE_EMBED_PROVIDER "${v}": expected "auto", "workers-ai", or "local".`);
}

export function parseEmbedMax(raw?: string): number | undefined {
	const v = raw?.trim();
	if (!v) return undefined;
	if (!/^\d+$/.test(v)) {
		throw new Error(`Invalid DERIVE_EMBED_MAX "${v}": must be a positive integer.`);
	}
	const n = Number(v);
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new Error(`Invalid DERIVE_EMBED_MAX "${v}": must be a positive integer.`);
	}
	return n;
}

export function resolveEmbedTarget(
	providerPref: EmbedProvider,
	env: NodeJS.ProcessEnv = process.env,
	explicitModel?: string,
): { provider: "workers-ai" | "local"; model: string } {
	const useWorkersAi = providerPref === "workers-ai" || (providerPref === "auto" && isWorkersAiConfigured(env));
	if (useWorkersAi) {
		const model = explicitModel?.trim() || env.DERIVE_EMBED_MODEL?.trim() || WORKERS_AI_EMBED_MODEL;
		return { provider: "workers-ai", model };
	}
	const localDefault = env === process.env ? resolveModel() : env.EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
	const model = explicitModel?.trim() || env.DERIVE_EMBED_MODEL?.trim() || localDefault;
	return { provider: "local", model };
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
	posts: DerivedPost[],
	mode: EmbedMode,
	optionsOrConcurrency: number | EmbedPostsOptions = 3,
): Promise<EmbedResult> {
	const t0 = Date.now();
	const opts: EmbedPostsOptions = typeof optionsOrConcurrency === "number" ? { concurrency: optionsOrConcurrency } : optionsOrConcurrency;
	const env = opts.env ?? process.env;
	const concurrency = opts.concurrency ?? 3;
	const batchSize = opts.batchSize ?? DEFAULT_WORKERS_AI_BATCH_SIZE;
	const providerPref = opts.provider ?? parseEmbedProvider(env.DERIVE_EMBED_PROVIDER);

	let maxEmbed: number | undefined;
	if (opts.maxEmbed !== undefined) {
		if (!Number.isInteger(opts.maxEmbed) || opts.maxEmbed < 1) {
			throw new Error(`Invalid maxEmbed "${opts.maxEmbed}": must be a positive integer.`);
		}
		maxEmbed = opts.maxEmbed;
	} else {
		maxEmbed = parseEmbedMax(env.DERIVE_EMBED_MAX);
	}

	const target = resolveEmbedTarget(providerPref, env, opts.model);
	const model = target.model;
	const provider: ResolvedEmbedProvider = mode === "fake" ? "fake" : target.provider;

	const index = await embeddingIndex(c);
	const stale = posts.filter((p) => {
		const row = index.get(p.legacyId);
		return !row || row.contentHash !== p.contentHash || row.model !== model;
	});
	const embedded: string[] = [];
	let missing: string[] = [];

	if (stale.length) {
		const toEmbed = maxEmbed !== undefined && stale.length > maxEmbed ? stale.slice(0, maxEmbed) : stale;
		const deferred = maxEmbed !== undefined && stale.length > maxEmbed ? stale.slice(maxEmbed) : [];

		const runSingleEmbedder = async (embed: (text: string) => Promise<number[]>) => {
			const queue = [...toEmbed];
			const worker = async () => {
				for (let p = queue.shift(); p; p = queue.shift()) {
					const v = await embed(p.embeddingText);
					if (v.length !== EMBEDDING_DIMENSIONS) {
						throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
					}
					await upsertEmbedding(c, p.legacyId, p.contentHash, model, v);
					embedded.push(p.legacyId);
					console.log(`[derive] embedded ${p.legacyId}`);
				}
			};
			await Promise.all(Array.from({ length: Math.min(concurrency, toEmbed.length) }, worker));
		};

		const recordDeferred = () => {
			if (deferred.length > 0) {
				missing = deferred.map((p) => p.legacyId);
				console.log(
					`[derive] DERIVE_EMBED_MAX=${maxEmbed}: embedded ${embedded.length}/${stale.length} stale post(s); ${missing.length} remaining deferred to a subsequent run: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
				);
			}
		};

		if (mode === "fake") {
			console.warn(`[derive] DERIVE_EMBED=fake: using pseudo embeddings for ${toEmbed.length} post(s) (test only)`);
			await runSingleEmbedder(async (t) => fakeEmbedding(t));
			recordDeferred();
		} else if (mode === "skip") {
			missing = stale.map((p) => p.legacyId);
			console.warn(
				`[derive] WARNING: ${missing.length} post(s) have no embedding (DERIVE_EMBED=skip); they are left out of related posts and /umap until "pnpm --filter web derive" runs where the embedding model is available: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
			);
		} else if (target.provider === "workers-ai") {
			if (isWorkersAiConfigured(env)) {
				for (let offset = 0; offset < toEmbed.length; offset += batchSize) {
					const batch = toEmbed.slice(offset, offset + batchSize);
					const vectors = await embedBatchWorkersAi(
						batch.map((p) => p.embeddingText),
						{
							model,
							batchSize: batch.length,
							maxInputChars: opts.maxInputChars,
							maxRetries: opts.maxRetries,
							baseDelayMs: opts.baseDelayMs,
							env,
							fetchFn: opts.fetchFn,
							sleepFn: opts.sleepFn,
						},
					);
					for (let i = 0; i < batch.length; i++) {
						const p = batch[i]!;
						const v = vectors[i]!;
						if (v.length !== EMBEDDING_DIMENSIONS) {
							throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
						}
						await upsertEmbedding(c, p.legacyId, p.contentHash, model, v);
						embedded.push(p.legacyId);
						console.log(`[derive] embedded ${p.legacyId} (workers-ai)`);
					}
				}
				recordDeferred();
			} else if (mode === "require") {
				throw new Error(
					`${stale.length} post(s) need embeddings with provider "workers-ai", but Cloudflare Workers AI credentials are not configured (set CF_ACCOUNT_ID and CF_AI_TOKEN).`,
				);
			} else {
				missing = stale.map((p) => p.legacyId);
				console.warn(
					`[derive] WARNING: ${missing.length} post(s) have no embedding (Cloudflare Workers AI credentials not configured); they are left out of related posts and /umap until "pnpm --filter web derive" runs with CF_ACCOUNT_ID/CF_AI_TOKEN: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
				);
			}
		} else {
			const checkLocal = opts.checkLocalServer ?? isEmbeddingServerRunning;
			if (await checkLocal()) {
				const embedLocal = opts.embedLocal ?? ((t: string) => embedFromText(t, { model }));
				await runSingleEmbedder(embedLocal);
				recordDeferred();
			} else if (mode === "require") {
				const hint =
					providerPref === "auto"
						? `configure Cloudflare Workers AI (CF_ACCOUNT_ID / CF_AI_TOKEN) or start LM Studio with ${model}`
						: `start LM Studio with ${model}, run "pnpm embedding:sync"`;
				throw new Error(`${stale.length} post(s) need embeddings but no embedding provider is available (${hint}).`);
			} else {
				missing = stale.map((p) => p.legacyId);
				console.warn(
					`[derive] WARNING: ${missing.length} post(s) have no embedding (embedding server not running); they are left out of related posts and /umap until "pnpm --filter web derive" runs where the embedding model is available: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`,
				);
			}
		}
	}

	const valid = new Map<string, { contentHash: string; model: string }>();
	for (const p of posts) valid.set(p.legacyId, { contentHash: p.contentHash, model });
	const vectors = await loadEmbeddings(c, valid);
	return { vectors, model, provider, reused: posts.length - stale.length, embedded, missing, seconds: (Date.now() - t0) / 1000 };
}
