import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS } from "../../../../packages/post-embedding/src/client.ts";
import { toVector } from "./db.ts";
import { embedPosts, fakeEmbedding, parseEmbedMax, parseEmbedProvider, resolveEmbedTarget } from "./embed.ts";
import {
	WORKERS_AI_EMBED_MODEL,
	embedBatchWorkersAi,
	isWorkersAiConfigured,
	parseRetryAfterMs,
	resolveWorkersAiConfig,
	truncateEmbeddingInput,
} from "./embed-workers-ai.ts";
import type { DerivedPost } from "./posts.ts";

const mkVector = (seed: number, dims = EMBEDDING_DIMENSIONS): number[] =>
	Array.from({ length: dims }, (_, i) => Math.fround(((seed + i) % 100) / 100));

const mkJsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});

const mkPost = (legacyId: string, text = `content for ${legacyId}`, contentHash = `hash-${legacyId}`): DerivedPost => ({
	legacyId,
	entry: {
		file: legacyId,
		hash: contentHash,
		id: legacyId,
		href: `/tech/${legacyId}`,
		title: legacyId,
		content: text,
		category: { label: "tech", href: "/tech" },
		tags: [],
		date: "2026-01-01",
		isShort: false,
	} as DerivedPost["entry"],
	tagLabels: [],
	cities: [],
	embeddingText: text,
	contentHash,
});

/** Minimal in-memory pg.Client mock supporting post_embeddings cache queries in cache.ts. */
function createMockCacheClient(initial: Array<{ legacy_id: string; content_hash: string; model: string; v: number[] }> = []) {
	const store = new Map<string, { legacy_id: string; content_hash: string; model: string; v: string }>();
	for (const row of initial) {
		store.set(row.legacy_id, { ...row, v: toVector(row.v) });
	}
	const upserts: Array<{ legacyId: string; contentHash: string; model: string }> = [];

	const client = {
		query: vi.fn(async (sql: string, params?: unknown[]) => {
			if (sql.includes("select legacy_id, content_hash, model from")) {
				return {
					rows: [...store.values()].map(({ legacy_id, content_hash, model }) => ({ legacy_id, content_hash, model })),
				};
			}
			if (sql.includes("insert into") && sql.includes("post_embeddings")) {
				const [legacyId, contentHash, model, vecText] = params as [string, string, string, string];
				store.set(legacyId, { legacy_id: legacyId, content_hash: contentHash, model, v: vecText });
				upserts.push({ legacyId, contentHash, model });
				return { rows: [], rowCount: 1 };
			}
			if (sql.includes("select legacy_id, content_hash, model, embedding::text as v from")) {
				return { rows: [...store.values()] };
			}
			throw new Error(`Unexpected SQL in mock client: ${sql}`);
		}),
	};

	return { client: client as any, store, upserts };
}

describe("Workers AI config & helpers", () => {
	it("detects short CF_* and standard CLOUDFLARE_* env var aliases", () => {
		expect(isWorkersAiConfigured({})).toBe(false);
		expect(isWorkersAiConfigured({ CF_ACCOUNT_ID: "acc" })).toBe(false);
		expect(isWorkersAiConfigured({ CF_AI_TOKEN: "tok" })).toBe(false);
		expect(isWorkersAiConfigured({ CF_ACCOUNT_ID: "  ", CF_AI_TOKEN: "tok" })).toBe(false);

		expect(resolveWorkersAiConfig({ CF_ACCOUNT_ID: "acc1", CF_AI_TOKEN: "tok1" })).toEqual({ accountId: "acc1", token: "tok1" });
		expect(resolveWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: "acc2", CLOUDFLARE_AI_API_TOKEN: "tok2" })).toEqual({ accountId: "acc2", token: "tok2" });
		expect(resolveWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: "acc3", CLOUDFLARE_API_TOKEN: "tok3" })).toEqual({ accountId: "acc3", token: "tok3" });
		expect(isWorkersAiConfigured({ CLOUDFLARE_ACCOUNT_ID: "acc3", CLOUDFLARE_API_TOKEN: "tok3" })).toBe(true);
	});

	it("truncates oversized inputs safely without splitting surrogate pairs", () => {
		expect(truncateEmbeddingInput("hello", 10)).toBe("hello");
		expect(truncateEmbeddingInput("abcdef", 4)).toBe("abcd");
		expect(truncateEmbeddingInput("abcdef", 0)).toBe("abcdef");
		// "ab" (2 code units) + "🚀" (2 code units, surrogate pair at indices 2..3)
		const withEmoji = "ab🚀cd";
		expect(truncateEmbeddingInput(withEmoji, 3)).toBe("ab");
		expect(truncateEmbeddingInput(withEmoji, 4)).toBe("ab🚀");
	});

	it("parses numeric and HTTP-date Retry-After headers", () => {
		expect(parseRetryAfterMs(null)).toBeUndefined();
		expect(parseRetryAfterMs("2")).toBe(2000);
		expect(parseRetryAfterMs("0.5")).toBe(500);
		const now = Date.UTC(2026, 10, 25, 10, 0, 0);
		expect(parseRetryAfterMs("Wed, 25 Nov 2026 10:00:05 GMT", now)).toBe(5000);
		expect(parseRetryAfterMs("Wed, 25 Nov 2026 09:59:50 GMT", now)).toBe(0);
		expect(parseRetryAfterMs("not-a-date", now)).toBeUndefined();
	});

	it("validates DERIVE_EMBED_PROVIDER and DERIVE_EMBED_MAX parsers", () => {
		expect(parseEmbedProvider(undefined)).toBe("auto");
		expect(parseEmbedProvider("workers-ai")).toBe("workers-ai");
		expect(parseEmbedProvider("local")).toBe("local");
		expect(() => parseEmbedProvider("openai")).toThrow(/Invalid DERIVE_EMBED_PROVIDER/);

		expect(parseEmbedMax(undefined)).toBeUndefined();
		expect(parseEmbedMax("")).toBeUndefined();
		expect(parseEmbedMax("200")).toBe(200);
		expect(() => parseEmbedMax("0")).toThrow(/Invalid DERIVE_EMBED_MAX/);
		expect(() => parseEmbedMax("-5")).toThrow(/Invalid DERIVE_EMBED_MAX/);
		expect(() => parseEmbedMax("abc")).toThrow(/Invalid DERIVE_EMBED_MAX/);
	});
});

describe("embedBatchWorkersAi", () => {
	it("splits 5 texts with batchSize=2 into 3 requests and preserves order", async () => {
		const calls: Array<{ url: string; auth: string | null; texts: string[] }> = [];
		let seq = 0;
		const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			const headers = new Headers(init?.headers);
			const body = JSON.parse(String(init?.body)) as { text: string[] };
			calls.push({ url, auth: headers.get("Authorization"), texts: body.text });
			const data = body.text.map(() => mkVector(++seq));
			return mkJsonResponse({ success: true, errors: [], result: { shape: [body.text.length, EMBEDDING_DIMENSIONS], data } });
		});

		const result = await embedBatchWorkersAi(["t1", "t2", "t3", "t4", "t5"], {
			accountId: "acct-123",
			token: "secret-tok",
			batchSize: 2,
			fetchFn: fetchFn as unknown as typeof fetch,
		});

		expect(calls).toHaveLength(3);
		expect(calls.map((c) => c.texts)).toEqual([["t1", "t2"], ["t3", "t4"], ["t5"]]);
		expect(calls[0]!.url).toBe(`https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/${WORKERS_AI_EMBED_MODEL}`);
		expect(calls[0]!.auth).toBe("Bearer secret-tok");
		expect(result).toHaveLength(5);
		expect(result[0]).toEqual(mkVector(1));
		expect(result[4]).toEqual(mkVector(5));
	});

	it("truncates long inputs before sending", async () => {
		let sentTexts: string[] = [];
		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			sentTexts = (JSON.parse(String(init?.body)) as { text: string[] }).text;
			return mkJsonResponse({ success: true, errors: [], result: { data: [mkVector(1)] } });
		});

		await embedBatchWorkersAi(["x".repeat(500)], {
			accountId: "a",
			token: "t",
			maxInputChars: 100,
			fetchFn: fetchFn as unknown as typeof fetch,
		});
		expect(sentTexts).toEqual(["x".repeat(100)]);
	});

	it("returns empty array without calling fetch when texts is empty", async () => {
		const fetchFn = vi.fn();
		const res = await embedBatchWorkersAi([], { fetchFn: fetchFn as unknown as typeof fetch });
		expect(res).toEqual([]);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("rejects success: false responses with error messages", async () => {
		const fetchFn = vi.fn(async () =>
			mkJsonResponse({
				success: false,
				errors: [{ code: 7003, message: "Could not route to model" }],
				result: null,
			}),
		);

		await expect(
			embedBatchWorkersAi(["hello"], {
				accountId: "a",
				token: "t",
				fetchFn: fetchFn as unknown as typeof fetch,
			}),
		).rejects.toThrow(/7003.*Could not route to model/);
	});

	it("validates 1024 dimensions and vector count", async () => {
		const wrongDimFetch = vi.fn(async () =>
			mkJsonResponse({ success: true, errors: [], result: { data: [mkVector(1, 512)] } }),
		);
		await expect(
			embedBatchWorkersAi(["hello"], {
				accountId: "a",
				token: "t",
				fetchFn: wrongDimFetch as unknown as typeof fetch,
			}),
		).rejects.toThrow(/512 dims, expected 1024 dims/);

		const wrongCountFetch = vi.fn(async () =>
			mkJsonResponse({ success: true, errors: [], result: { data: [mkVector(1)] } }),
		);
		await expect(
			embedBatchWorkersAi(["hello", "world"], {
				accountId: "a",
				token: "t",
				fetchFn: wrongCountFetch as unknown as typeof fetch,
			}),
		).rejects.toThrow(/returned 1 embedding\(s\) for batch of 2/);
	});

	it("retries on 429 (honouring Retry-After) and 503 with exponential backoff", async () => {
		const sleeps: number[] = [];
		const responses = [
			mkJsonResponse({ success: false, errors: [{ message: "rate limited" }] }, 429, { "Retry-After": "3" }),
			mkJsonResponse({ success: false, errors: [{ message: "upstream unavailable" }] }, 503),
			mkJsonResponse({ success: true, errors: [], result: { data: [mkVector(7)] } }, 200),
		];
		let idx = 0;
		const fetchFn = vi.fn(async () => responses[idx++]!);

		const res = await embedBatchWorkersAi(["hello"], {
			accountId: "a",
			token: "t",
			maxRetries: 3,
			baseDelayMs: 250,
			fetchFn: fetchFn as unknown as typeof fetch,
			sleepFn: async (ms) => {
				sleeps.push(ms);
			},
		});

		expect(fetchFn).toHaveBeenCalledTimes(3);
		// Attempt 0: 429 with Retry-After: 3 -> 3000ms; Attempt 1: 503 without Retry-After -> 250 * 2^1 = 500ms
		expect(sleeps).toEqual([3000, 500]);
		expect(res).toEqual([mkVector(7)]);
	});

	it("fails after exhausting retries on persistent 503 and does not retry 401", async () => {
		const sleeps: number[] = [];
		const fetch503 = vi.fn(async () => new Response("Service Unavailable", { status: 503 }));
		await expect(
			embedBatchWorkersAi(["hello"], {
				accountId: "a",
				token: "t",
				maxRetries: 2,
				baseDelayMs: 100,
				fetchFn: fetch503 as unknown as typeof fetch,
				sleepFn: async (ms) => {
					sleeps.push(ms);
				},
			}),
		).rejects.toThrow(/HTTP 503 after 3 attempt\(s\)/);
		expect(sleeps).toEqual([100, 200]);

		const fetch401 = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
		await expect(
			embedBatchWorkersAi(["hello"], {
				accountId: "a",
				token: "t",
				maxRetries: 3,
				fetchFn: fetch401 as unknown as typeof fetch,
			}),
		).rejects.toThrow(/HTTP 401/);
		expect(fetch401).toHaveBeenCalledTimes(1);
	});
});

describe("embedPosts provider selection, model isolation & DERIVE_EMBED_MAX", () => {
	it("auto-selects workers-ai when CF credentials are set and keys cache on @cf/qwen/qwen3-embedding-0.6b", async () => {
		const posts = [mkPost("p1"), mkPost("p2")];
		// Cache already has legacy LM Studio vectors for p1 and p2 — they must NOT be reused for workers-ai!
		const { client, upserts, store } = createMockCacheClient([
			{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(99) },
			{ legacy_id: "p2", content_hash: "hash-p2", model: DEFAULT_MODEL, v: mkVector(98) },
		]);

		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			return mkJsonResponse({
				success: true,
				errors: [],
				result: { data: text.map((_, i) => mkVector(10 + i)) },
			});
		});

		const res = await embedPosts(client, posts, "auto", {
			env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" },
			fetchFn: fetchFn as unknown as typeof fetch,
		});

		expect(res.provider).toBe("workers-ai");
		expect(res.model).toBe(WORKERS_AI_EMBED_MODEL);
		expect(res.reused).toBe(0); // legacy LM Studio cache rows were NOT silently reused
		expect(res.embedded).toEqual(["p1", "p2"]);
		expect(res.missing).toEqual([]);
		expect(upserts.map((u) => u.model)).toEqual([WORKERS_AI_EMBED_MODEL, WORKERS_AI_EMBED_MODEL]);
		expect(store.get("p1")?.model).toBe(WORKERS_AI_EMBED_MODEL);
		expect(res.vectors.get("p1")).toEqual(mkVector(10));
	});

	it("keeps legacy model key isolated when DERIVE_EMBED_PROVIDER=local", async () => {
		const posts = [mkPost("p1"), mkPost("p2")];
		const { client } = createMockCacheClient([
			{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(1) },
			{ legacy_id: "p2", content_hash: "hash-p2", model: WORKERS_AI_EMBED_MODEL, v: mkVector(2) },
		]);

		const embedLocal = vi.fn(async () => mkVector(42));
		const res = await embedPosts(client, posts, "auto", {
			// Even with CF credentials present, explicit DERIVE_EMBED_PROVIDER=local forces legacy LM Studio.
			env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok", DERIVE_EMBED_PROVIDER: "local" },
			checkLocalServer: async () => true,
			embedLocal,
		});

		expect(res.provider).toBe("local");
		expect(res.model).toBe(DEFAULT_MODEL);
		expect(res.reused).toBe(1); // p1 matched legacy model
		expect(res.embedded).toEqual(["p2"]); // p2 had workers-ai model, so re-embedded for local
		expect(embedLocal).toHaveBeenCalledTimes(1);
		expect(res.vectors.get("p1")).toEqual(mkVector(1));
		expect(res.vectors.get("p2")).toEqual(mkVector(42));
	});

	it("gracefully falls back and skips in auto mode when neither CF credentials nor local server are available (D10)", async () => {
		const posts = [mkPost("p1"), mkPost("p2")];
		const { client } = createMockCacheClient([
			{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(5) },
		]);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, posts, "auto", {
				env: {},
				checkLocalServer: async () => false,
			});

			expect(res.provider).toBe("local");
			expect(res.model).toBe(DEFAULT_MODEL);
			expect(res.reused).toBe(1);
			expect(res.embedded).toEqual([]);
			expect(res.missing).toEqual(["p2"]);
			expect(res.vectors.size).toBe(1);
			expect(res.vectors.has("p1")).toBe(true);
			expect(warnSpy).toHaveBeenCalled();
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("throws in require mode when no provider is available", async () => {
		const posts = [mkPost("p1")];
		const { client } = createMockCacheClient();

		await expect(
			embedPosts(client, posts, "require", {
				env: {},
				checkLocalServer: async () => false,
			}),
		).rejects.toThrow(/no embedding provider is available/);

		await expect(
			embedPosts(client, posts, "require", {
				env: { DERIVE_EMBED_PROVIDER: "workers-ai" },
			}),
		).rejects.toThrow(/Cloudflare Workers AI credentials are not configured/);
	});

	it("enforces DERIVE_EMBED_MAX chunked backfill, commits per batch, and leaves remainder in missing", async () => {
		const posts = [mkPost("p1"), mkPost("p2"), mkPost("p3"), mkPost("p4"), mkPost("p5")];
		// p1 is already cached with the Workers AI model; p2..p5 are stale (4 stale posts).
		const { client, upserts } = createMockCacheClient([
			{ legacy_id: "p1", content_hash: "hash-p1", model: WORKERS_AI_EMBED_MODEL, v: mkVector(1) },
		]);

		const batchSizes: number[] = [];
		const upsertOrder: string[] = [];
		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			batchSizes.push(text.length);
			// Track that previous batch was already committed before next batch is requested
			upsertOrder.push(`fetch:${text.length}:committed=${upserts.length}`);
			return mkJsonResponse({
				success: true,
				errors: [],
				result: { data: text.map((_, i) => mkVector(20 + i)) },
			});
		});

		const env = {
			CF_ACCOUNT_ID: "acct",
			CF_AI_TOKEN: "tok",
			DERIVE_EMBED_MAX: "3",
		};

		// Day 1 run: embeds 3 of the 4 stale posts (p2, p3, p4) in batches of 2 + 1; p5 deferred to missing.
		const day1 = await embedPosts(client, posts, "auto", {
			env,
			batchSize: 2,
			fetchFn: fetchFn as unknown as typeof fetch,
		});

		expect(day1.reused).toBe(1);
		expect(day1.embedded).toEqual(["p2", "p3", "p4"]);
		expect(day1.missing).toEqual(["p5"]);
		expect(day1.vectors.size).toBe(4);
		expect(batchSizes).toEqual([2, 1]);
		// Second batch saw the first 2 posts already committed to cache!
		expect(upsertOrder).toEqual(["fetch:2:committed=0", "fetch:1:committed=2"]);

		// Day 2 run: picks up only p5 seamlessly.
		const day2 = await embedPosts(client, posts, "auto", {
			env,
			batchSize: 2,
			fetchFn: fetchFn as unknown as typeof fetch,
		});

		expect(day2.reused).toBe(4);
		expect(day2.embedded).toEqual(["p5"]);
		expect(day2.missing).toEqual([]);
		expect(day2.vectors.size).toBe(5);
	});

	it("preserves DERIVE_EMBED=skip and DERIVE_EMBED=fake modes", async () => {
		const posts = [mkPost("p1"), mkPost("p2")];
		const { client } = createMockCacheClient();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const skipped = await embedPosts(client, posts, "skip", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" } });
			expect(skipped.embedded).toEqual([]);
			expect(skipped.missing).toEqual(["p1", "p2"]);
			expect(skipped.model).toBe(WORKERS_AI_EMBED_MODEL);

			const faked = await embedPosts(client, posts, "fake", { env: {}, maxEmbed: 1 });
			expect(faked.provider).toBe("fake");
			expect(faked.embedded).toEqual(["p1"]);
			expect(faked.missing).toEqual(["p2"]);
			expect(faked.vectors.get("p1")).toEqual(fakeEmbedding(posts[0]!.embeddingText));
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("supports custom DERIVE_EMBED_MODEL override for workers-ai", () => {
		const target = resolveEmbedTarget("workers-ai", {
			DERIVE_EMBED_MODEL: "@cf/baai/bge-m3",
		});
		expect(target).toEqual({ provider: "workers-ai", model: "@cf/baai/bge-m3" });
	});
});
