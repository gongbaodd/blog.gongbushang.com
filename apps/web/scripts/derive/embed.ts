// Embedding stage: only posts/episodes whose content_hash (or model) changed are embedded; everything else comes from the cache.
// Supports Cloudflare Workers AI (@cf/qwen/qwen3-embedding-0.6b, preferred in `auto` when configured)
// and the legacy local embedder (LM Studio via metadata-embedding `embedFromText`).
// Cache rows are keyed by `model`, so a provider switch makes every row stale. That is handled in one run:
//   - the whole corpus is re-embedded (about 2.2k of the 10k free neurons/day), no chunking, no DERIVE_EMBED_MAX;
//   - new vectors for a pure model switch (text unchanged) are held in memory and written only by finalizeEmbeddings(),
//     after the whole switch set (posts AND podcasts) succeeded; otherwise nothing is written and relates/UMAP keep using the
//     previous model's vectors for the whole corpus. One corpus never mixes models (new/edited items still commit at once);
//   - a single item that never fits the context is skipped (keeps its old vector) and does not block the rest.
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
	embedSettledWorkersAi,
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
	/** Per-request timeout for Workers AI (ms). */
	requestTimeoutMs?: number;
	/** Shared by the post and podcast calls of one run (skip Workers AI after an outage/quota). */
	session?: EmbedSession;
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

/** Shared across the post and podcast calls of one derive run. */
export interface EmbedSession {
	/** Set once Workers AI reported quota/outage; later calls skip it instead of failing the same way again. */
	workersAiDown?: string;
}

export interface EmbedResult {
	table: EmbeddingTable;
	vectors: Map<string, number[]>;
	model: string;
	provider: ResolvedEmbedProvider;
	reused: number;
	/** Items whose new vector is committed to the cache (new or edited content). */
	embedded: string[];
	/** Items that need an embedding but have no vector at all (unavailable, skip mode, quota, or new/edited text). */
	missing: string[];
	/** Items whose text is unchanged but that still use a vector from a previous embedding model. */
	staleModel: string[];
	/** Items whose input was cut to fit the model context (Workers AI). */
	truncated: string[];
	/** Items that exceed the context even after every shrink: skipped, they keep their old vector (or are missing). */
	unembeddable: string[];
	/**
	 * Model switch (text unchanged, only the model differs): new vectors are held in memory, not written, until
	 * `finalizeEmbeddings` sees that the whole switch set (posts AND podcasts) succeeded. Until then relates/UMAP use
	 * the old vectors only, so one corpus never mixes models.
	 */
	switchPending: Array<{ id: string; contentHash: string; vector: number[] }>;
	/** Switch items that were not embedded (quota, outage, skip, no provider). Non-empty means the switch is incomplete. */
	switchOutstanding: string[];
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
	const session = opts.session ?? {};
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
	/** Text unchanged, only the model differs: this item has a valid old vector. */
	const modelOnly = new Set(stale.filter((p) => {
		const row = index.get(p.legacyId);
		return row !== undefined && row.contentHash === p.contentHash;
	}).map((p) => p.legacyId));

	const embedded: string[] = [];
	const truncated: string[] = [];
	const unembeddable: string[] = [];
	const switchPending: EmbedResult["switchPending"] = [];
	let notAttempted: Embeddable[] = [];

	const list = (ids: string[]) => `${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", ..." : ""}`;

	/** New/edited content commits right away; a model-only switch is held back (see EmbedResult.switchPending). */
	const accept = async (p: Embeddable, v: number[], label = "") => {
		if (v.length !== EMBEDDING_DIMENSIONS) {
			throw new Error(`embedding for ${p.legacyId} has ${v.length} dims, expected ${EMBEDDING_DIMENSIONS}`);
		}
		if (modelOnly.has(p.legacyId)) {
			switchPending.push({ id: p.legacyId, contentHash: p.contentHash, vector: v });
			return;
		}
		await upsertEmbedding(c, p.legacyId, p.contentHash, model, v, table);
		embedded.push(p.legacyId);
		console.log(`[derive] embedded ${noun} ${p.legacyId}${label}`);
	};

	if (stale.length) {
		const runSingleEmbedder = async (embed: (text: string) => Promise<number[]>) => {
			const queue = [...stale];
			const worker = async () => {
				for (let p = queue.shift(); p; p = queue.shift()) {
					await accept(p, await embed(normalizeEmbeddingInput(p.embeddingText)));
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
			if (!isWorkersAiConfigured(env)) {
				if (mode === "require") {
					throw new Error(
						`${stale.length} ${noun}(s) need embeddings with provider "workers-ai", but Cloudflare Workers AI credentials are not configured (set CF_ACCOUNT_ID and CF_AI_TOKEN).`,
					);
				}
				notAttempted = stale;
				console.warn(`[derive] WARNING: Cloudflare Workers AI credentials not configured (set CF_ACCOUNT_ID and CF_AI_TOKEN); ${stale.length} ${noun}(s) not embedded.`);
			} else if (session.workersAiDown && mode !== "require") {
				notAttempted = stale;
				console.warn(`[derive] WARNING: Workers AI already unavailable in this run (${session.workersAiDown}); ${stale.length} ${noun}(s) not embedded.`);
			} else {
				let offset = 0;
				outer: for (; offset < stale.length; offset += batchSize) {
					const batch = stale.slice(offset, offset + batchSize);
					const settled = await embedSettledWorkersAi(
						batch.map((p) => p.embeddingText),
						{
							model,
							batchSize: batch.length,
							maxInputTokens: opts.maxInputTokens,
							maxRetries: opts.maxRetries,
							baseDelayMs: opts.baseDelayMs,
							requestTimeoutMs: opts.requestTimeoutMs,
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
						const r = settled[i]!;
						if (!(r instanceof WorkersAiError)) {
							await accept(p, r, " (workers-ai)");
						} else if (r.kind === "context") {
							// This item alone never fits: skip it, keep going (it must not block the others or every later run).
							unembeddable.push(p.legacyId);
							notAttempted.push(p);
							console.warn(`[derive] WARNING: ${noun} ${p.legacyId} exceeds the embedding context even after truncation; skipped (${r.message})`);
						} else {
							if (mode === "require") throw r;
							// Quota / outage after retries: graceful (D10). Everything from here on is not embedded.
							session.workersAiDown = `${r.kind}: ${r.message}`;
							notAttempted.push(...stale.slice(offset + i));
							console.warn(
								`[derive] WARNING: Workers AI ${r.kind} (${r.message}); ${stale.length - offset - i} ${noun}(s) not embedded. Re-run derive later (cached vectors are kept).`,
							);
							break outer;
						}
					}
				}
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
						: `start LM Studio with ${model}`;
				throw new Error(`${stale.length} ${noun}(s) need embeddings but no embedding provider is available (${hint}).`);
			} else {
				notAttempted = stale;
				console.warn(`[derive] WARNING: embedding server not running; ${stale.length} ${noun}(s) not embedded.`);
			}
		}
	}

	// Cache rows are never mixed with held-back vectors here: only old-model rows with matching text are accepted.
	const valid = new Map<string, { contentHash: string; model: string }>();
	for (const p of posts) valid.set(p.legacyId, { contentHash: p.contentHash, model });
	const vectors = await loadEmbeddings(c, valid, table, true);
	const missing = notAttempted.filter((p) => !vectors.has(p.legacyId)).map((p) => p.legacyId);
	const staleModel = notAttempted.filter((p) => vectors.has(p.legacyId)).map((p) => p.legacyId);
	// Switch items that did not get a new vector, except ones that can never fit the context.
	const switchOutstanding = notAttempted.filter((p) => modelOnly.has(p.legacyId) && !unembeddable.includes(p.legacyId)).map((p) => p.legacyId);
	if (missing.length) {
		console.warn(
			`[derive] WARNING: ${missing.length} ${noun}(s) have no embedding; they are left out of related posts and /umap until "pnpm --filter web derive" runs with an embedding provider available: ${list(missing)}`,
		);
	}
	if (truncated.length) {
		console.warn(`[derive] ${truncated.length} ${noun}(s) exceeded the embedding context and were truncated before embedding: ${list(truncated)}`);
	}
	return {
		table,
		vectors,
		model,
		provider,
		reused: posts.length - stale.length,
		embedded,
		missing,
		staleModel,
		truncated,
		unembeddable,
		switchPending,
		switchOutstanding,
		seconds: (Date.now() - t0) / 1000,
	};
}

/**
 * Commit a model switch only if every switch item of every table was embedded, so relates/UMAP never mix models.
 * Complete: held vectors are written and replace the old ones in `result.vectors`. Incomplete: nothing is written and
 * the previous vectors stay in use for the whole corpus (the held vectors are dropped; the next run redoes them).
 * Items that never fit the context keep their old vector (one-item exception, logged).
 */
export async function finalizeEmbeddings(c: pg.Client, results: EmbedResult[]): Promise<{ switched: boolean; heldBack: number }> {
	const pending = results.reduce((n, r) => n + r.switchPending.length, 0);
	if (pending === 0 && results.every((r) => r.switchOutstanding.length === 0)) return { switched: true, heldBack: 0 };
	const outstanding = results.reduce((n, r) => n + r.switchOutstanding.length, 0);
	if (outstanding === 0) {
		for (const r of results) {
			for (const s of r.switchPending) {
				await upsertEmbedding(c, s.id, s.contentHash, r.model, s.vector, r.table);
				r.vectors.set(s.id, s.vector);
				r.embedded.push(s.id);
			}
			r.switchPending.length = 0;
			const noun = r.table === "post_embeddings" ? "post" : "episode";
			console.log(`[derive] model switch committed for ${noun}s (${r.embedded.length} embedded in total)`);
		}
		const kept = results.flatMap((r) => r.unembeddable.filter((id) => r.vectors.has(id)));
		if (kept.length) console.warn(`[derive] WARNING: ${kept.length} item(s) keep a vector from a previous embedding model because they never fit the context: ${kept.slice(0, 5).join(", ")}`);
		return { switched: true, heldBack: 0 };
	}
	let held = 0;
	for (const r of results) {
		held += r.switchPending.length;
		for (const s of r.switchPending) if (!r.staleModel.includes(s.id)) r.staleModel.push(s.id);
		for (const id of r.switchOutstanding) if (!r.staleModel.includes(id) && r.vectors.has(id)) r.staleModel.push(id);
		r.switchPending.length = 0;
	}
	console.warn(
		`[derive] WARNING: model switch incomplete (${outstanding} item(s) not embedded; ${held} new vector(s) held back and not written): relates and UMAP keep using the previous model's vectors for the whole corpus. Re-run derive when the provider is available.`,
	);
	return { switched: false, heldBack: held };
}
