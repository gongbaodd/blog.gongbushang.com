// Cloudflare Workers AI embedding client (@cf/qwen/qwen3-embedding-0.6b, 1024 dims).
// Uses Node's built-in fetch (zero extra dependencies) with batching, input truncation, and 429/5xx retries.
import { EMBEDDING_DIMENSIONS } from "../../../../packages/post-embedding/src/client.ts";

export const WORKERS_AI_EMBED_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
export const DEFAULT_WORKERS_AI_BATCH_SIZE = 16;
/** Defensive character cap per input so giant posts stay safely within the 32K-token model context window. */
export const DEFAULT_WORKERS_AI_MAX_CHARS = 24_000;
export const DEFAULT_WORKERS_AI_MAX_RETRIES = 3;
export const DEFAULT_WORKERS_AI_BASE_DELAY_MS = 1_000;
const DEFAULT_API_BASE_URL = "https://api.cloudflare.com/client/v4";

export interface WorkersAiConfig {
	accountId: string;
	token: string;
}

export interface WorkersAiEmbedOptions {
	accountId?: string;
	token?: string;
	model?: string;
	/** Max texts per HTTP request (default 16). */
	batchSize?: number;
	/** Defensive character cap per input text (default 24_000; 0 disables truncation). */
	maxInputChars?: number;
	/** Max retries on HTTP 429 / 5xx responses (default 3). */
	maxRetries?: number;
	/** Initial exponential backoff delay in ms when Retry-After is absent (default 1000). */
	baseDelayMs?: number;
	/** Injectable fetch implementation (default globalThis.fetch). */
	fetchFn?: typeof fetch;
	/** Injectable sleep implementation for deterministic tests. */
	sleepFn?: (ms: number) => Promise<void>;
	/** Env lookup fallback when accountId/token are omitted (default process.env). */
	env?: NodeJS.ProcessEnv;
	/** API base URL override (default https://api.cloudflare.com/client/v4). */
	apiBaseUrl?: string;
}

interface WorkersAiErrorItem {
	code?: number;
	message?: string;
}

interface WorkersAiResponse {
	success?: boolean;
	errors?: Array<WorkersAiErrorItem | string>;
	result?: {
		shape?: number[];
		data?: unknown;
	};
}

/** Resolve Cloudflare Workers AI credentials from env (supports short CF_* and standard CLOUDFLARE_* names). */
export function resolveWorkersAiConfig(env: NodeJS.ProcessEnv = process.env): WorkersAiConfig | undefined {
	const accountId = env.CF_ACCOUNT_ID?.trim() || env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
	const token = env.CF_AI_TOKEN?.trim() || env.CLOUDFLARE_AI_API_TOKEN?.trim() || env.CLOUDFLARE_API_TOKEN?.trim() || "";
	if (!accountId || !token) return undefined;
	return { accountId, token };
}

/** Whether Cloudflare Workers AI account + API token are present in env. */
export function isWorkersAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
	return resolveWorkersAiConfig(env) !== undefined;
}

/** Parse HTTP Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfterMs(header: string | null, nowMs = Date.now()): number | undefined {
	if (!header) return undefined;
	const trimmed = header.trim();
	if (!trimmed) return undefined;
	if (/^\d+(\.\d+)?$/.test(trimmed)) {
		return Math.max(0, Math.ceil(Number(trimmed) * 1000));
	}
	const parsed = Date.parse(trimmed);
	if (!Number.isNaN(parsed)) {
		return Math.max(0, parsed - nowMs);
	}
	return undefined;
}

/** Truncate text defensively without splitting a UTF-16 surrogate pair. */
export function truncateEmbeddingInput(text: string, maxInputChars: number): string {
	if (maxInputChars <= 0 || text.length <= maxInputChars) return text;
	let end = maxInputChars;
	const lastCode = text.charCodeAt(end - 1);
	if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
	return text.slice(0, end);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function formatErrors(errors: WorkersAiResponse["errors"]): string {
	if (!Array.isArray(errors) || errors.length === 0) return "";
	return errors
		.map((err) => {
			if (typeof err === "string") return err;
			if (err && typeof err === "object") {
				const code = err.code !== undefined ? `[${err.code}] ` : "";
				return `${code}${err.message ?? JSON.stringify(err)}`;
			}
			return String(err);
		})
		.join("; ");
}

async function readErrorSnippet(res: Response): Promise<string> {
	try {
		const raw = (await res.text()).trim();
		return raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
	} catch {
		return "";
	}
}

/**
 * Embed an array of texts via Cloudflare Workers AI REST API (`@cf/qwen/qwen3-embedding-0.6b` by default).
 * Splits inputs into batches, truncates oversized inputs defensively, retries 429/5xx with backoff,
 * and validates vector count and 1024-dim output.
 */
export async function embedBatchWorkersAi(texts: string[], options: WorkersAiEmbedOptions = {}): Promise<number[][]> {
	if (texts.length === 0) return [];

	const envCfg = resolveWorkersAiConfig(options.env ?? process.env);
	const accountId = options.accountId?.trim() || envCfg?.accountId;
	const token = options.token?.trim() || envCfg?.token;
	if (!accountId || !token) {
		throw new Error("Cloudflare Workers AI credentials missing: set CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) and CF_AI_TOKEN (or CLOUDFLARE_AI_API_TOKEN / CLOUDFLARE_API_TOKEN).");
	}

	const model = options.model?.trim() || WORKERS_AI_EMBED_MODEL;
	const batchSize = options.batchSize ?? DEFAULT_WORKERS_AI_BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) {
		throw new Error(`Invalid Workers AI batchSize "${batchSize}": must be a positive integer.`);
	}
	const maxInputChars = options.maxInputChars ?? DEFAULT_WORKERS_AI_MAX_CHARS;
	if (!Number.isInteger(maxInputChars) || maxInputChars < 0) {
		throw new Error(`Invalid Workers AI maxInputChars "${maxInputChars}": must be a non-negative integer.`);
	}
	const maxRetries = options.maxRetries ?? DEFAULT_WORKERS_AI_MAX_RETRIES;
	if (!Number.isInteger(maxRetries) || maxRetries < 0) {
		throw new Error(`Invalid Workers AI maxRetries "${maxRetries}": must be a non-negative integer.`);
	}
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_WORKERS_AI_BASE_DELAY_MS;
	if (typeof baseDelayMs !== "number" || !Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
		throw new Error(`Invalid Workers AI baseDelayMs "${baseDelayMs}": must be a non-negative finite number.`);
	}

	const fetchFn = options.fetchFn ?? globalThis.fetch;
	const sleepFn = options.sleepFn ?? defaultSleep;
	const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
	const url = `${apiBaseUrl}/accounts/${accountId}/ai/run/${model}`;

	const out: number[][] = [];

	for (let offset = 0; offset < texts.length; offset += batchSize) {
		const batch = texts.slice(offset, offset + batchSize).map((t) => truncateEmbeddingInput(t, maxInputChars));

		let payload: WorkersAiResponse | undefined;
		for (let attempt = 0; ; attempt++) {
			const res = await fetchFn(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ text: batch }),
			});

			const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
			if (retryable) {
				if (attempt < maxRetries) {
					const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
					const delayMs = retryAfterMs ?? baseDelayMs * 2 ** attempt;
					await sleepFn(delayMs);
					continue;
				}
				const snippet = await readErrorSnippet(res);
				throw new Error(`Workers AI request failed with HTTP ${res.status} after ${attempt + 1} attempt(s)${snippet ? `: ${snippet}` : ""}`);
			}

			if (!res.ok) {
				const snippet = await readErrorSnippet(res);
				throw new Error(`Workers AI request failed with HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`);
			}

			payload = (await res.json()) as WorkersAiResponse;
			break;
		}

		if (!payload || payload.success !== true) {
			const details = formatErrors(payload?.errors);
			throw new Error(`Workers AI embedding failed${details ? `: ${details}` : ": response success !== true"}`);
		}
		if (Array.isArray(payload.errors) && payload.errors.length > 0) {
			throw new Error(`Workers AI embedding returned errors: ${formatErrors(payload.errors)}`);
		}

		const data = payload.result?.data;
		if (!Array.isArray(data)) {
			throw new Error("Workers AI embedding response missing result.data array");
		}
		if (data.length !== batch.length) {
			throw new Error(`Workers AI returned ${data.length} embedding(s) for batch of ${batch.length}`);
		}

		for (let i = 0; i < data.length; i++) {
			const vec = data[i];
			if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
				const got = Array.isArray(vec) ? `${vec.length} dims` : typeof vec;
				throw new Error(`Workers AI embedding[${offset + i}] has ${got}, expected ${EMBEDDING_DIMENSIONS} dims`);
			}
			for (let j = 0; j < vec.length; j++) {
				const val = vec[j];
				if (typeof val !== "number" || !Number.isFinite(val)) {
					throw new Error(`Workers AI embedding[${offset + i}][${j}] is not a finite number`);
				}
			}
			out.push(vec as number[]);
		}
	}

	return out;
}
