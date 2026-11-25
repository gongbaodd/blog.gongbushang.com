import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL, EMBEDDING_DIMENSIONS } from "../../../../packages/post-embedding/src/client.ts";
import { toVector } from "./db.ts";
import { embedPosts, finalizeEmbeddings, fakeEmbedding, parseEmbedProvider, resolveEmbedTarget } from "./embed.ts";
import {
	WORKERS_AI_EMBED_MODEL,
	WorkersAiError,
	embedBatchWorkersAi,
	estimateTokens,
	isWorkersAiConfigured,
	normalizeEmbeddingInput,
	parseRetryAfterMs,
	resolveWorkersAiConfig,
	truncateToTokenBudget,
	validateEmbedModel,
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
function createMockCacheClient(initial: Array<{ legacy_id: string; content_hash: string; model: string; v: number[] }> = [], table = "post_embeddings") {
	const store = new Map<string, { legacy_id: string; content_hash: string; model: string; v: string }>();
	for (const row of initial) {
		store.set(row.legacy_id, { ...row, v: toVector(row.v) });
	}
	const upserts: Array<{ legacyId: string; contentHash: string; model: string }> = [];

	const client = {
		query: vi.fn(async (sql: string, params?: unknown[]) => {
			if (!sql.includes(table)) throw new Error(`mock client for ${table} got SQL for another table: ${sql}`);
			if (sql.includes("select legacy_id, content_hash, model from")) {
				return {
					rows: [...store.values()].map(({ legacy_id, content_hash, model }) => ({ legacy_id, content_hash, model })),
				};
			}
			if (sql.includes("insert into") && sql.includes(table)) {
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
		// The deploy token must never be picked up for Workers AI.
		expect(resolveWorkersAiConfig({ CLOUDFLARE_ACCOUNT_ID: "acc3", CLOUDFLARE_API_TOKEN: "tok3" })).toBeUndefined();
		expect(isWorkersAiConfigured({ CLOUDFLARE_ACCOUNT_ID: "acc3", CLOUDFLARE_API_TOKEN: "tok3" })).toBe(false);
	});

	it("normalises newlines like legacy embed.py", () => {
		expect(normalizeEmbeddingInput("title: a\ncontent: b\n\nc")).toBe("title: a content: b  c");
	});

	it("estimates tokens conservatively and CJK-safe, cutting at code point boundaries", () => {
		expect(estimateTokens("hello world")).toBe(4); // 11 * 0.3 = 3.3 -> 4
		expect(estimateTokens("你好世界")).toBe(4); // 1 token per CJK char
		expect(truncateToTokenBudget("hello", 100)).toBe("hello");
		expect(truncateToTokenBudget("abc", 0)).toBe("abc"); // 0 disables
		// Chinese: 6000 chars is already the whole budget
		const zh = "字".repeat(10_000);
		expect(truncateToTokenBudget(zh, 6000)).toHaveLength(6000);
		// English: 6000 tokens is about 20k chars, while CJK gets 6000 chars
		const en = "a".repeat(100_000);
		expect(Math.abs(truncateToTokenBudget(en, 6000).length - 20_000)).toBeLessThanOrEqual(1);
		// astral code points count 2 and are never split
		const emoji = "ab" + "\u{1F680}".repeat(10);
		const cut = truncateToTokenBudget(emoji, 5); // 2*0.3 + 2 + 2 = 4.6 ok, third emoji exceeds
		expect(cut).toBe("ab\u{1F680}\u{1F680}");
		expect(() => encodeURIComponent(cut)).not.toThrow(); // no lone surrogate
	});

	it("validates the model charset", () => {
		expect(validateEmbedModel("@cf/qwen/qwen3-embedding-0.6b")).toBe("@cf/qwen/qwen3-embedding-0.6b");
		expect(validateEmbedModel("text-embedding-qwen3-embedding-0.6b")).toBe("text-embedding-qwen3-embedding-0.6b");
		for (const bad of ["", "a b", "../x", "@cf/a/../b", "a?x=1", "a#b", "m\nx", "@cf//x", "x;rm"]) {
			expect(() => validateEmbedModel(bad), bad).toThrow(/Invalid DERIVE_EMBED_MODEL/);
		}
		expect(() => resolveEmbedTarget("workers-ai", { DERIVE_EMBED_MODEL: "bad model" })).toThrow(/Invalid DERIVE_EMBED_MODEL/);
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

	it("validates the DERIVE_EMBED_PROVIDER parser", () => {
		expect(parseEmbedProvider(undefined)).toBe("auto");
		expect(parseEmbedProvider("workers-ai")).toBe("workers-ai");
		expect(parseEmbedProvider("local")).toBe("local");
		expect(() => parseEmbedProvider("openai")).toThrow(/Invalid DERIVE_EMBED_PROVIDER/);
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

		const truncatedIdx: number[] = [];
		await embedBatchWorkersAi(["x\n".repeat(500)], {
			accountId: "a",
			token: "t",
			maxInputTokens: 30, // 100 ASCII chars
			fetchFn: fetchFn as unknown as typeof fetch,
			onTruncate: (i) => truncatedIdx.push(i),
		});
		expect(sentTexts[0]!.length).toBeGreaterThanOrEqual(99); expect(sentTexts[0]).toMatch(/^(x )+x?$/); // newlines became spaces, then capped
		expect(truncatedIdx).toEqual([0]);
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

describe("embedPosts provider selection, provider switch, quota & podcast table", () => {
	/** embedPosts + the end-of-run commit of a pure model switch (what derive/index.ts does). */
	const embedAndSwitch = async (...args: Parameters<typeof embedPosts>) => {
		const r = await embedPosts(...args);
		await finalizeEmbeddings(args[0], [r]);
		return r;
	};
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

		const res = await embedAndSwitch(client, posts, "auto", {
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
		const res = await embedAndSwitch(client, posts, "auto", {
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

	const okResponder = () =>
		vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			return mkJsonResponse({ success: true, errors: [], messages: [], result: { shape: [text.length, EMBEDDING_DIMENSIONS], data: text.map((_, i) => mkVector(20 + i)) } });
		});

	it("re-embeds the whole corpus in one run on a provider switch (no chunking) and ignores DERIVE_EMBED_MAX", async () => {
		const posts = Array.from({ length: 5 }, (_, i) => mkPost(`p${i + 1}`));
		const { client } = createMockCacheClient(posts.map((p, i) => ({ legacy_id: p.legacyId, content_hash: p.contentHash, model: DEFAULT_MODEL, v: mkVector(i) })));
		const fetchFn = okResponder();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedAndSwitch(client, posts, "auto", { env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok", DERIVE_EMBED_MAX: "2" }, batchSize: 2, fetchFn: fetchFn as unknown as typeof fetch });
			expect(res.embedded).toHaveLength(5);
			expect(res.missing).toEqual([]);
			expect(res.staleModel).toEqual([]);
			expect(res.vectors.size).toBe(5);
			expect(fetchFn).toHaveBeenCalledTimes(3);
			expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("DERIVE_EMBED_MAX is no longer supported"))).toBe(true);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("partial model switch (quota mid-run) writes nothing and keeps the WHOLE corpus on the old model; new items are missing (D10)", async () => {
		const posts = [mkPost("p1"), mkPost("p2"), mkPost("p3"), mkPost("p4")];
		// p1..p3 have old LM Studio vectors for the same text; p4 is new.
		const { client, store, upserts } = createMockCacheClient(
			["p1", "p2", "p3"].map((id, i) => ({ legacy_id: id, content_hash: `hash-${id}`, model: DEFAULT_MODEL, v: mkVector(i) })),
		);
		let call = 0;
		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			call++;
			if (call === 1) return mkJsonResponse({ success: true, errors: [], result: { data: text.map(() => mkVector(77)) } });
			return mkJsonResponse({ success: false, errors: [{ code: 4006, message: "daily free allocation exceeded" }] }, 429);
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedAndSwitch(client, posts, "auto", {
				env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" },
				batchSize: 2,
				maxRetries: 1,
				sleepFn: async () => {},
				fetchFn: fetchFn as unknown as typeof fetch,
			});
			// p1, p2 were embedded (held back), p3 and p4 were not: switch incomplete.
			expect(upserts).toEqual([]); // nothing written, not even for the successful batch
			expect(res.embedded).toEqual([]);
			expect(res.vectors.get("p1")).toEqual(mkVector(0)); // old vectors, all of them
			expect(res.vectors.get("p2")).toEqual(mkVector(1));
			expect(res.vectors.get("p3")).toEqual(mkVector(2));
			expect([...res.staleModel].sort()).toEqual(["p1", "p2", "p3"]);
			expect(res.missing).toEqual(["p4"]); // brand new, nothing to fall back to
			expect(res.vectors.size).toBe(3);
			expect(store.get("p1")?.model).toBe(DEFAULT_MODEL);
		} finally {
			warnSpy.mockRestore();
		}
		// require mode: the same quota failure is a hard error.
		call = 1;
		const { client: client2 } = createMockCacheClient();
		await expect(
			embedPosts(client2, posts, "require", { env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" }, maxRetries: 0, sleepFn: async () => {}, fetchFn: fetchFn as unknown as typeof fetch }),
		).rejects.toBeInstanceOf(WorkersAiError);
	});

	it("edited posts commit incrementally even while the model switch is held back", async () => {
		const posts = [mkPost("p1"), mkPost("p2", "edited text", "hash-new")];
		const { client, upserts } = createMockCacheClient([
			{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(1) },
			{ legacy_id: "p2", content_hash: "hash-old", model: DEFAULT_MODEL, v: mkVector(2) },
		]);
		const fetchFn = okResponder();
		const res = await embedAndSwitch(client, posts, "auto", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" }, batchSize: 1, fetchFn: fetchFn as unknown as typeof fetch });
		expect(res.embedded.sort()).toEqual(["p1", "p2"]); // complete: both written
		expect(upserts.length).toBe(2);
	});

	it("the model switch spans tables: posts succeed, podcasts hit quota -> nothing is written for either", async () => {
		const posts = [mkPost("p1")];
		const eps = [mkPost("e1")];
		// One client serves both tables (as in derive/index.ts); ids are distinct, "embeddings" matches both table names.
		const { client: pc, upserts: pu } = createMockCacheClient(
			[
				{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(1) },
				{ legacy_id: "e1", content_hash: "hash-e1", model: DEFAULT_MODEL, v: mkVector(2) },
			],
			"embeddings",
		);
		const ec = pc;
		const eu = pu;
		const env = { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" };
		const session = {};
		const ok = okResponder();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const pr = await embedPosts(pc, posts, "auto", { env, session, fetchFn: ok as unknown as typeof fetch });
			const quota = vi.fn(async () => mkJsonResponse({ success: false, errors: [{ code: 4006, message: "quota" }] }, 429));
			const er = await embedPosts(ec, eps, "auto", { env, session, maxRetries: 0, fetchFn: quota as unknown as typeof fetch });
			expect(pr.switchPending).toHaveLength(1);
			expect(er.switchOutstanding).toEqual(["e1"]);
			// one shared client object per table in the mock, but finalize writes through each result's own table
			await finalizeEmbeddings(pc, [pr, er]);
			expect(pu).toEqual([]);
			expect(eu).toEqual([]);
			expect(pr.vectors.get("p1")).toEqual(mkVector(1));
			expect(er.vectors.get("e1")).toEqual(mkVector(2));
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("after posts hit quota/outage the podcast call skips Workers AI (shared session)", async () => {
		const env = { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" };
		const session: { workersAiDown?: string } = {};
		const down = vi.fn(async () => new Response("down", { status: 503 }));
		const { client: pc } = createMockCacheClient();
		const { client: ec } = createMockCacheClient([], "podcast_embeddings");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			await embedPosts(pc, [mkPost("p1")], "auto", { env, session, maxRetries: 0, fetchFn: down as unknown as typeof fetch });
			expect(session.workersAiDown).toMatch(/unavailable/);
			const callsAfterPosts = down.mock.calls.length;
			const er = await embedPosts(ec, [mkPost("e1")], "auto", { env, session, maxRetries: 0, fetchFn: down as unknown as typeof fetch }, "podcast_embeddings");
			expect(down.mock.calls.length).toBe(callsAfterPosts); // no extra call
			expect(er.missing).toEqual(["e1"]);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("an item that never fits the context is skipped without losing the batch or blocking the run", async () => {
		const posts = [mkPost("bad", "x".repeat(5000)), mkPost("ok1", "short"), mkPost("ok2", "short too")];
		const { client } = createMockCacheClient();
		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			if (text.some((t) => t.length > 1)) {
				// "bad" never fits: always rejects anything over 100 chars, however short we cut it (min budget 64 tokens ~ 213 chars)
				if (text.some((t) => t.length > 100)) return mkJsonResponse({ success: false, errors: [{ code: 5006, message: "input exceeds the maximum context length" }] }, 400);
			}
			return mkJsonResponse({ success: true, errors: [], result: { data: text.map(() => mkVector(3)) } });
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedAndSwitch(client, posts, "auto", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" }, fetchFn: fetchFn as unknown as typeof fetch });
			expect(res.unembeddable).toEqual(["bad"]);
			expect(res.embedded.sort()).toEqual(["ok1", "ok2"]); // fetched vectors kept
			expect(res.missing).toEqual(["bad"]);
			expect(res.vectors.size).toBe(2);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("a quota error on the 400 path is quota (never enters the shrink loop); bare 'exceed' is not a context error", async () => {
		const { client } = createMockCacheClient();
		const calls: number[] = [];
		const quota400 = vi.fn(async () => {
			calls.push(1);
			return mkJsonResponse({ success: false, errors: [{ code: 4006, message: "you have exceeded the daily free allocation" }] }, 400);
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, [mkPost("p1", "x".repeat(3000))], "auto", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" }, fetchFn: quota400 as unknown as typeof fetch });
			expect(calls.length).toBe(1); // no shrink retries
			expect(res.missing).toEqual(["p1"]);
		} finally {
			warnSpy.mockRestore();
		}
		const exceedOther = vi.fn(async () => mkJsonResponse({ success: false, errors: [{ code: 1000, message: "rate exceeded for key" }] }, 400));
		await expect(embedBatchWorkersAi(["a"], { accountId: "a", token: "t", fetchFn: exceedOther as unknown as typeof fetch })).rejects.toThrow(/HTTP 400/);
		expect(exceedOther).toHaveBeenCalledTimes(1);
	});

	it("caps Retry-After, passes an abort signal, and degrades network errors to 'unavailable' (D10)", async () => {
		const sleeps: number[] = [];
		const slow = vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "3600" } }));
		await expect(
			embedBatchWorkersAi(["a"], { accountId: "a", token: "t", maxRetries: 1, sleepFn: async (ms) => void sleeps.push(ms), fetchFn: slow as unknown as typeof fetch }),
		).rejects.toMatchObject({ kind: "quota" });
		expect(sleeps).toEqual([30_000]);

		let signal: AbortSignal | undefined | null;
		const ok = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
			signal = init?.signal;
			return mkJsonResponse({ success: true, errors: [], result: { data: [mkVector(1)] } });
		});
		await embedBatchWorkersAi(["a"], { accountId: "a", token: "t", fetchFn: ok as unknown as typeof fetch });
		expect(signal).toBeInstanceOf(AbortSignal);

		const netErr = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		await expect(embedBatchWorkersAi(["a"], { accountId: "a", token: "t", maxRetries: 1, sleepFn: async () => {}, fetchFn: netErr as unknown as typeof fetch })).rejects.toMatchObject({ kind: "unavailable" });
		expect(netErr).toHaveBeenCalledTimes(2);

		// In derive (auto) that means graceful, not a crash.
		const { client } = createMockCacheClient();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, [mkPost("p1")], "auto", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" }, maxRetries: 0, fetchFn: netErr as unknown as typeof fetch });
			expect(res.missing).toEqual(["p1"]);
		} finally {
			warnSpy.mockRestore();
		}
	});

it("DERIVE_EMBED=skip after a provider switch keeps old-model vectors", async () => {
		const posts = [mkPost("p1"), mkPost("p2")];
		const { client } = createMockCacheClient([{ legacy_id: "p1", content_hash: "hash-p1", model: DEFAULT_MODEL, v: mkVector(3) }]);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, posts, "skip", { env: { CF_ACCOUNT_ID: "a", CF_AI_TOKEN: "t" } });
			expect(res.staleModel).toEqual(["p1"]);
			expect(res.missing).toEqual(["p2"]);
			expect(res.vectors.has("p1")).toBe(true);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("does not reuse a vector whose content_hash changed even when falling back", async () => {
		const posts = [mkPost("p1", "new text", "hash-new")];
		const { client } = createMockCacheClient([{ legacy_id: "p1", content_hash: "hash-old", model: DEFAULT_MODEL, v: mkVector(3) }]);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, posts, "skip", { env: {} });
			expect(res.missing).toEqual(["p1"]);
			expect(res.vectors.size).toBe(0);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("embeds podcast episodes into podcast_embeddings (table path), keyed by model", async () => {
		const episodes = [mkPost("e1"), mkPost("e2")];
		const { client, upserts, store } = createMockCacheClient([{ legacy_id: "e1", content_hash: "hash-e1", model: DEFAULT_MODEL, v: mkVector(1) }], "podcast_embeddings");
		const fetchFn = okResponder();
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const res = await embedAndSwitch(client, episodes, "auto", { env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" }, fetchFn: fetchFn as unknown as typeof fetch }, "podcast_embeddings");
			expect([...res.embedded].sort()).toEqual(["e1", "e2"]);
			expect(res.vectors.size).toBe(2);
			expect(upserts.every((u) => u.model === WORKERS_AI_EMBED_MODEL)).toBe(true);
			expect(store.get("e2")?.model).toBe(WORKERS_AI_EMBED_MODEL);
			expect(logSpy.mock.calls.some((c) => String(c[0]).includes("embedded episode e2"))).toBe(true);
			// The 4th positional form used by derive/index.ts (concurrency number) also works with the table.
			const again = await embedAndSwitch(client, episodes, "auto", { env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" } }, "podcast_embeddings");
			expect(again.reused).toBe(2);
			expect(fetchFn).toHaveBeenCalledTimes(1);
		} finally {
			logSpy.mockRestore();
		}
		// Posts table must not be touched by the mock for podcast runs.
		const fetchCount = fetchFn.mock.calls.length;
		expect(fetchCount).toBe(1);
	});

	it("truncates and retries a single oversized item on a context-length error instead of failing the batch", async () => {
		const big = "x".repeat(10_000);
		const posts = [mkPost("small", "short"), mkPost("big", big)];
		const { client } = createMockCacheClient();
		const sent: number[][] = [];
		const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { text } = JSON.parse(String(init?.body)) as { text: string[] };
			sent.push(text.map((t) => t.length));
			// Simulate the model rejecting anything over 2,000 chars.
			if (text.some((t) => t.length > 2000)) {
				return mkJsonResponse({ success: false, errors: [{ code: 5006, message: "input exceeds the maximum context length of 8192 tokens" }] }, 400);
			}
			return mkJsonResponse({ success: true, errors: [], result: { data: text.map(() => mkVector(5)) } });
		});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await embedPosts(client, posts, "auto", {
				env: { CF_ACCOUNT_ID: "acct", CF_AI_TOKEN: "tok" },
				maxInputTokens: 6000, // 20k ASCII chars, so the pre-cap does not cut it; only the retry does
				fetchFn: fetchFn as unknown as typeof fetch,
			});
			expect(res.embedded.sort()).toEqual(["big", "small"]);
			expect(res.truncated).toEqual(["big"]);
			expect(res.vectors.size).toBe(2);
			// batch (rejected) -> small alone -> big alone, shrinking by 60 % until under 2000 chars
			expect(sent[0]).toEqual([5, 10_000]);
			expect(sent.at(-1)![0]).toBeLessThanOrEqual(2000);
			expect(sent.at(-1)![0]).toBeGreaterThan(500);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("parses a realistic Workers AI REST response (envelope with result.shape/result.data, messages, no errors)", async () => {
		// Shape documented for @cf/qwen/qwen3-embedding-0.6b: result = { shape: [n, 1024], data: number[][] } inside the v4 envelope.
		const body = {
			result: { shape: [2, EMBEDDING_DIMENSIONS], data: [mkVector(1), mkVector(2)] },
			success: true,
			errors: [],
			messages: [],
		};
		const fetchFn = vi.fn(async () => mkJsonResponse(body));
		const out = await embedBatchWorkersAi(["a", "b"], { accountId: "acct", token: "tok", fetchFn: fetchFn as unknown as typeof fetch });
		expect(out).toEqual(body.result.data);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/qwen/qwen3-embedding-0.6b");
		expect(JSON.parse(String(init.body))).toEqual({ text: ["a", "b"] });
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

			const faked = await embedPosts(client, posts, "fake", { env: {} });
			expect(faked.provider).toBe("fake");
			expect(faked.embedded).toEqual(["p1", "p2"]);
			expect(faked.missing).toEqual([]);
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
