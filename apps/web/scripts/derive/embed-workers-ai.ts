// Cloudflare Workers AI embedding client (@cf/qwen/qwen3-embedding-0.6b, 1024 dims).
// Uses Node's built-in fetch (zero extra dependencies) with batching, input normalisation, token-budget truncation,
// context-length truncate-and-retry per item, and 429/5xx retries.
//
// Input text is identical to legacy (packages/embedding/src/embedding/embed.py: text.replace("\n", " ")).
// The model context is 8,192 tokens. Inputs are capped at ~6,000 *estimated* tokens (conservative: ASCII 0.3
// token per char, anything else 1 token per code point, astral code points 2), so only very long posts are cut,
// and only their tail. If the API still reports a context-length error, the item is cut to 60 % and retried
// (up to 5 times). Truncated items are reported through `onTruncate` and logged by derive; the cache key
// (content_hash) is still the hash of the full text, so a truncated item is not re-embedded on every build.
import { EMBEDDING_DIMENSIONS } from "../../../../packages/post-embedding/src/client.ts";

export const WORKERS_AI_EMBED_MODEL = "@cf/qwen/qwen3-embedding-0.6b";
export const DEFAULT_WORKERS_AI_BATCH_SIZE = 16;
/** Model context window is 8,192 tokens; stay well below it with a conservative estimate. */
export const DEFAULT_WORKERS_AI_MAX_TOKENS = 6_000;
const CONTEXT_SHRINK_FACTOR = 0.6;
const CONTEXT_MAX_SHRINKS = 5;
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
	/** Estimated-token cap per input text (default 6000; model context is 8192). */
	maxInputTokens?: number;
	/** Per-request timeout in ms (default 60000; 0 disables). */
	requestTimeoutMs?: number;
	/** Called with the batch-relative index of each input that had to be truncated. */
	onTruncate?: (index: number) => void;
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

/**
 * Resolve Cloudflare Workers AI credentials from env. The token must be a Workers-AI-scoped token (CF_AI_TOKEN or
 * CLOUDFLARE_AI_API_TOKEN); CLOUDFLARE_API_TOKEN (a deploy token) is deliberately never used.
 */
export function resolveWorkersAiConfig(env: NodeJS.ProcessEnv = process.env): WorkersAiConfig | undefined {
	const accountId = env.CF_ACCOUNT_ID?.trim() || env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
	const token = env.CF_AI_TOKEN?.trim() || env.CLOUDFLARE_AI_API_TOKEN?.trim() || "";
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

/** Same normalisation as legacy embed.py: newlines become spaces. */
export function normalizeEmbeddingInput(text: string): string {
	return text.replace(/\n/g, " ");
}

/** Conservative token estimate (CJK-safe): ASCII 0.3 per char, other code points 1, astral 2. */
export function estimateTokens(text: string): number {
	let t = 0;
	for (const ch of text) {
		const cp = ch.codePointAt(0)!;
		t += cp < 0x80 ? 0.3 : cp > 0xffff ? 2 : 1;
	}
	return Math.ceil(t);
}

/** Cut text to an estimated-token budget at a code point boundary (never splits a surrogate pair). */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
	if (maxTokens <= 0) return text;
	let t = 0;
	let end = 0;
	for (const ch of text) {
		const cp = ch.codePointAt(0)!;
		t += cp < 0x80 ? 0.3 : cp > 0xffff ? 2 : 1;
		if (t > maxTokens) return text.slice(0, end);
		end += ch.length;
	}
	return text;
}

/** Charset guard for DERIVE_EMBED_MODEL (it is interpolated into a URL path and stored in the cache). */
export function validateEmbedModel(model: string): string {
	const m = model.trim();
	if (!/^[A-Za-z0-9@][A-Za-z0-9@._:\/-]{0,127}$/.test(m) || m.includes("..") || m.includes("//")) {
		throw new Error(`Invalid DERIVE_EMBED_MODEL "${model.slice(0, 60)}": use letters, digits and "@ . _ : / -" only (e.g. ${WORKERS_AI_EMBED_MODEL}).`);
	}
	return m;
}

export type WorkersAiErrorKind = "quota" | "unavailable" | "context";

/** Thrown for failures derive treats as "embedding unavailable" (D10) rather than a bug. */
export class WorkersAiError extends Error {
	constructor(
		message: string,
		readonly kind: WorkersAiErrorKind,
		readonly status?: number,
	) {
		super(message);
		this.name = "WorkersAiError";
	}
}

const CONTEXT_RE = /context (length|window)|too (long|large|many tokens)|token limit|max(imum)? (input )?(length|tokens)/i;
const QUOTA_CODES = new Set([4006]); // "daily free allocation of 10,000 neurons"

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

/** Validate one response vector list against the expected count and dimensions. */
function validateVectors(data: unknown, expected: number): number[][] {
	if (!Array.isArray(data)) throw new Error("Workers AI embedding response missing result.data array");
	if (data.length !== expected) throw new Error(`Workers AI returned ${data.length} embedding(s) for batch of ${expected}`);
	for (let i = 0; i < data.length; i++) {
		const vec = data[i];
		if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
			const got = Array.isArray(vec) ? `${vec.length} dims` : typeof vec;
			throw new Error(`Workers AI embedding[${i}] has ${got}, expected ${EMBEDDING_DIMENSIONS} dims`);
		}
		for (let j = 0; j < vec.length; j++) {
			const val = vec[j];
			if (typeof val !== "number" || !Number.isFinite(val)) throw new Error(`Workers AI embedding[${i}][${j}] is not a finite number`);
		}
	}
	return data as number[][];
}

/** Per input: its vector, or the WorkersAiError that stopped it (kind "context" = that item alone; "quota"/"unavailable" = stop). */
export type SettledEmbedding = number[] | WorkersAiError;

/** Longest honoured Retry-After; a larger value is capped so a build never sleeps for minutes. */
export const MAX_RETRY_AFTER_MS = 30_000;
export const DEFAULT_WORKERS_AI_REQUEST_TIMEOUT_MS = 60_000;

function errorCodes(errors: WorkersAiResponse["errors"]): number[] {
	return (Array.isArray(errors) ? errors : []).flatMap((e) => (typeof e === "object" && e && typeof e.code === "number" ? [e.code] : []));
}

/**
 * Like embedBatchWorkersAi, but WorkersAiError outcomes are returned per item instead of thrown, so vectors already
 * fetched are never lost: an item that still exceeds the context after every shrink gets a "context" error and the
 * rest continue; a quota/unavailable error is returned for that item and every item after it (the caller stops).
 * Other errors (bad token, malformed response) still throw.
 */
export async function embedSettledWorkersAi(texts: string[], options: WorkersAiEmbedOptions = {}): Promise<SettledEmbedding[]> {
	if (texts.length === 0) return [];

	const envCfg = resolveWorkersAiConfig(options.env ?? process.env);
	const accountId = options.accountId?.trim() || envCfg?.accountId;
	const token = options.token?.trim() || envCfg?.token;
	if (!accountId || !token) {
		throw new Error("Cloudflare Workers AI credentials missing: set CF_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID) and CF_AI_TOKEN (a Workers AI scoped token; CLOUDFLARE_API_TOKEN is not used).");
	}
	if (!/^[A-Za-z0-9_-]+$/.test(accountId)) throw new Error("Invalid Cloudflare account id: expected letters and digits only.");

	const model = validateEmbedModel(options.model?.trim() || WORKERS_AI_EMBED_MODEL);
	const batchSize = options.batchSize ?? DEFAULT_WORKERS_AI_BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) {
		throw new Error(`Invalid Workers AI batchSize "${batchSize}": must be a positive integer.`);
	}
	const maxInputTokens = options.maxInputTokens ?? DEFAULT_WORKERS_AI_MAX_TOKENS;
	if (!Number.isInteger(maxInputTokens) || maxInputTokens < 0) {
		throw new Error(`Invalid Workers AI maxInputTokens "${maxInputTokens}": must be a non-negative integer.`);
	}
	const maxRetries = options.maxRetries ?? DEFAULT_WORKERS_AI_MAX_RETRIES;
	if (!Number.isInteger(maxRetries) || maxRetries < 0) {
		throw new Error(`Invalid Workers AI maxRetries "${maxRetries}": must be a non-negative integer.`);
	}
	const baseDelayMs = options.baseDelayMs ?? DEFAULT_WORKERS_AI_BASE_DELAY_MS;
	if (typeof baseDelayMs !== "number" || !Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
		throw new Error(`Invalid Workers AI baseDelayMs "${baseDelayMs}": must be a non-negative finite number.`);
	}
	const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_WORKERS_AI_REQUEST_TIMEOUT_MS;

	const fetchFn = options.fetchFn ?? globalThis.fetch;
	const sleepFn = options.sleepFn ?? defaultSleep;
	const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
	const url = `${apiBaseUrl}/accounts/${accountId}/ai/run/${model}`;

	/** One HTTP call for already-prepared inputs, with retries. Throws WorkersAiError on quota/unavailable/context. */
	const request = async (batch: string[]): Promise<number[][]> => {
		for (let attempt = 0; ; attempt++) {
			let res: Response;
			try {
				res = await fetchFn(url, {
					method: "POST",
					headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
					body: JSON.stringify({ text: batch }),
					signal: requestTimeoutMs > 0 ? AbortSignal.timeout(requestTimeoutMs) : undefined,
				});
			} catch (e) {
				// Network failure (DNS, reset, "fetch failed", timeout): retry, then degrade like an outage (D10).
				if (attempt < maxRetries) {
					await sleepFn(Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_AFTER_MS));
					continue;
				}
				throw new WorkersAiError(`Workers AI request failed (network): ${e instanceof Error ? e.message : String(e)}`, "unavailable");
			}

			const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
			if (retryable) {
				if (attempt < maxRetries) {
					const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
					await sleepFn(Math.min(retryAfterMs ?? baseDelayMs * 2 ** attempt, MAX_RETRY_AFTER_MS));
					continue;
				}
				const snippet = await readErrorSnippet(res);
				throw new WorkersAiError(
					`Workers AI request failed with HTTP ${res.status} after ${attempt + 1} attempt(s)${snippet ? `: ${snippet}` : ""}`,
					res.status === 429 ? "quota" : "unavailable",
					res.status,
				);
			}

			if (!res.ok) {
				const raw = await readErrorSnippet(res);
				let codes: number[] = [];
				try {
					codes = errorCodes((JSON.parse(raw) as WorkersAiResponse).errors);
				} catch {
					// snippet may be truncated or not JSON
				}
				// Quota first: it must never enter the shrink loop.
				if (codes.some((c) => QUOTA_CODES.has(c)) || /daily free allocation|neurons/i.test(raw)) {
					throw new WorkersAiError(`Workers AI quota exhausted (HTTP ${res.status}): ${raw}`, "quota", res.status);
				}
				if ((res.status === 400 || res.status === 413 || res.status === 422) && CONTEXT_RE.test(raw)) {
					throw new WorkersAiError(`Workers AI context length exceeded (HTTP ${res.status}): ${raw}`, "context", res.status);
				}
				throw new Error(`Workers AI request failed with HTTP ${res.status}${raw ? `: ${raw}` : ""}`);
			}

			const payload = (await res.json()) as WorkersAiResponse;
			if (!payload || payload.success !== true) {
				const details = formatErrors(payload?.errors);
				if (errorCodes(payload?.errors).some((c) => QUOTA_CODES.has(c))) throw new WorkersAiError(`Workers AI quota exhausted: ${details}`, "quota");
				if (CONTEXT_RE.test(details)) throw new WorkersAiError(`Workers AI context length exceeded: ${details}`, "context");
				throw new Error(`Workers AI embedding failed${details ? `: ${details}` : ": response success !== true"}`);
			}
			if (Array.isArray(payload.errors) && payload.errors.length > 0) {
				throw new Error(`Workers AI embedding returned errors: ${formatErrors(payload.errors)}`);
			}
			return validateVectors(payload.result?.data, batch.length);
		}
	};

	/** Single item: on a context-length error cut to 60 % and retry (max 5 times). */
	const requestOne = async (text: string, index: number): Promise<number[]> => {
		let cur = text;
		for (let shrink = 0; ; shrink++) {
			try {
				return (await request([cur]))[0]!;
			} catch (e) {
				if (!(e instanceof WorkersAiError) || e.kind !== "context" || shrink >= CONTEXT_MAX_SHRINKS) throw e;
				const budget = Math.max(64, Math.floor(estimateTokens(cur) * CONTEXT_SHRINK_FACTOR));
				cur = truncateToTokenBudget(cur, budget);
				options.onTruncate?.(index);
			}
		}
	};

	const out: SettledEmbedding[] = [];
	for (let offset = 0; offset < texts.length; offset += batchSize) {
		const raw = texts.slice(offset, offset + batchSize).map(normalizeEmbeddingInput);
		const batch = raw.map((t, i) => {
			const cut = truncateToTokenBudget(t, maxInputTokens);
			if (cut.length !== t.length) options.onTruncate?.(offset + i);
			return cut;
		});
		try {
			out.push(...(await request(batch)));
		} catch (e) {
			if (!(e instanceof WorkersAiError)) throw e;
			if (e.kind !== "context") {
				// quota / unavailable: this batch and everything after it
				while (out.length < texts.length) out.push(e);
				return out;
			}
			// One oversized input must not fail the batch: go item by item.
			for (let i = 0; i < batch.length; i++) {
				try {
					out.push(await requestOne(batch[i]!, offset + i));
				} catch (e2) {
					if (!(e2 instanceof WorkersAiError)) throw e2;
					out.push(e2);
					if (e2.kind !== "context") {
						while (out.length < texts.length) out.push(e2);
						return out;
					}
				}
			}
		}
	}
	return out;
}

/**
 * Embed an array of texts via Cloudflare Workers AI REST API (`@cf/qwen/qwen3-embedding-0.6b` by default).
 * Throws the first WorkersAiError (quota / unavailable / an item that never fits the context); see
 * embedSettledWorkersAi for the per-item variant derive uses.
 */
export async function embedBatchWorkersAi(texts: string[], options: WorkersAiEmbedOptions = {}): Promise<number[][]> {
	const settled = await embedSettledWorkersAi(texts, options);
	for (const s of settled) if (s instanceof WorkersAiError) throw s;
	return settled as number[][];
}
