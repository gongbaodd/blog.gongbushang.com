import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cloudinaryMedia,
	createNodeCloudinaryProvider,
	createNodeEnvLookup,
} from "./cloudinary-media.ts";
import {
	SETUP_GATE_COOKIE,
	createAdminMiddleware,
	matches,
	normalize,
	onRequest,
} from "./middleware.ts";
import { buildHealthzResponse, GET as getHealthz, onRequest as healthzOuterMiddleware } from "./pages/healthz.ts";
import {
	createPlugin,
	dispatchFromNodeEnv,
	readNodeDispatchEnv,
	rebuildOnPublish,
} from "./rebuild-on-publish.ts";

type CookieOptions = Record<string, unknown>;

function createMockContext(urlStr: string, initialCookies: Record<string, string> = {}, method = "GET") {
	const jar = new Map<string, { value: string; options?: CookieOptions }>(
		Object.entries(initialCookies).map(([k, v]) => [k, { value: v }]),
	);
	const setCalls: Array<{ name: string; value: string; options?: CookieOptions }> = [];
	const url = new URL(urlStr);

	const context = {
		url,
		request: new Request(urlStr, { method }),
		cookies: {
			get(name: string) {
				const entry = jar.get(name);
				return entry ? { value: entry.value } : undefined;
			},
			set(name: string, value: string, options?: CookieOptions) {
				jar.set(name, { value, options });
				setCalls.push({ name, value, options });
			},
		},
		redirect(location: string, status = 302) {
			return new Response(null, { status, headers: { Location: location } });
		},
	};

	return { context, setCalls, jar };
}

async function runMw(
	mw: (ctx: never, next: () => Promise<Response>) => Promise<Response | void> | Response | void,
	ctx: unknown,
	next: () => Promise<Response>,
): Promise<Response> {
	const res = await mw(ctx as never, next);
	if (!res) throw new Error("Expected middleware to return a Response");
	return res;
}

describe("admin middleware (SETUP_TOKEN gate & X-Robots-Tag)", () => {
	const originalSetupToken = process.env.SETUP_TOKEN;
	const originalSiteEnv = process.env.SITE_ENV;

	afterEach(() => {
		if (originalSetupToken === undefined) delete process.env.SETUP_TOKEN;
		else process.env.SETUP_TOKEN = originalSetupToken;
		if (originalSiteEnv === undefined) delete process.env.SITE_ENV;
		else process.env.SITE_ENV = originalSiteEnv;
	});

	it("normalizes encoded, uppercase, and duplicate-slash paths and rejects malformed percent-encoding", () => {
		expect(normalize("/_EMDASH//admin///%73etup")).toBe("/_emdash/admin/setup");
		expect(normalize("/_emdash/api/%53ETUP/status")).toBe("/_emdash/api/setup/status");
		expect(normalize("/_emdash/admin/%E0%A4%A")).toBeNull();
	});

	it("matches tokens in constant time and rejects empty or mismatched values", async () => {
		expect(await matches("secret-123", "secret-123")).toBe(true);
		expect(await matches("secret-124", "secret-123")).toBe(false);
		expect(await matches(null, "secret-123")).toBe(false);
		expect(await matches(undefined, "secret-123")).toBe(false);
		expect(await matches("", "secret-123")).toBe(false);
	});

	it("returns 400 on malformed percent-encoded pathname", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: "top-secret", SITE_ENV: "testing" }),
			isDev: false,
		});
		const { context } = createMockContext("http://localhost:4322/_emdash/admin/setup");
		// Force malformed pathname that URL wouldn't normally allow
		Object.defineProperty(context.url, "pathname", { value: "/_emdash/admin/%E0%A4%A" });
		const next = vi.fn(async () => new Response("ok"));

		const res = await runMw(mw, context, next);
		expect(res.status).toBe(400);
		expect(next).not.toHaveBeenCalled();
	});

	it("fails closed (404) on setup paths when SETUP_TOKEN is unset or empty", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: undefined, SITE_ENV: "testing" }),
			isDev: false,
		});
		const next = vi.fn(async () => new Response("setup page"));

		for (const path of [
			"/_emdash/admin/setup",
			"/_emdash/admin/setup/",
			"/_emdash/api/setup",
			"/_emdash/api/setup/status",
			"/_EMDASH/api/%73etup",
			"//_emdash///admin//setup?setup_token=anything",
		]) {
			const { context } = createMockContext(`http://localhost:4322${path}`);
			const res = await runMw(mw, context, next);
			expect(res.status).toBe(404);
		}
		expect(next).not.toHaveBeenCalled();
	});

	it("sets httpOnly cookie and redirects to clean URL when ?setup_token matches", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: "valid-token", SITE_ENV: "testing" }),
			isDev: false,
		});
		const next = vi.fn(async () => new Response("setup page"));
		const { context, setCalls } = createMockContext(
			"http://localhost:4322/_emdash/admin/setup?setup_token=valid-token&next=1",
		);

		const res = await runMw(mw, context, next);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/_emdash/admin/setup?next=1");
		expect(setCalls).toEqual([
			{
				name: SETUP_GATE_COOKIE,
				value: "valid-token",
				options: {
					path: "/_emdash/",
					httpOnly: true,
					secure: true,
					sameSite: "strict",
					maxAge: 3600,
				},
			},
		]);
		expect(next).not.toHaveBeenCalled();
	});

	it("rejects wrong ?setup_token or wrong cookie with 404", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: "valid-token", SITE_ENV: "testing" }),
			isDev: false,
		});
		const next = vi.fn(async () => new Response("setup page"));

		const wrongQuery = createMockContext("http://localhost:4322/_emdash/admin/setup?setup_token=wrong");
		expect((await runMw(mw, wrongQuery.context, next)).status).toBe(404);
		expect(wrongQuery.setCalls).toHaveLength(0);

		const wrongCookie = createMockContext("http://localhost:4322/_emdash/api/setup/status", {
			[SETUP_GATE_COOKIE]: "wrong",
		});
		expect((await runMw(mw, wrongCookie.context, next)).status).toBe(404);
		expect(next).not.toHaveBeenCalled();
	});

	it("allows setup request when growgen_setup_gate cookie matches SETUP_TOKEN", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: "valid-token", SITE_ENV: "testing" }),
			isDev: false,
		});
		const next = vi.fn(async () => new Response("setup ok", { status: 200 }));
		const { context } = createMockContext("http://localhost:4322/_emdash/admin/setup", {
			[SETUP_GATE_COOKIE]: "valid-token",
		});

		const res = await runMw(mw, context, next);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("setup ok");
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("bypasses setup gate when isDev is true", async () => {
		const mw = createAdminMiddleware({
			getEnv: () => ({ SETUP_TOKEN: undefined, SITE_ENV: "local" }),
			isDev: true,
		});
		const next = vi.fn(async () => new Response("dev setup ok", { status: 200 }));
		const { context } = createMockContext("http://localhost:4322/_emdash/admin/setup");

		const res = await runMw(mw, context, next);
		expect(res.status).toBe(200);
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
	});

	it("sets X-Robots-Tag: noindex, nofollow for local, testing, and unset SITE_ENV, and omits it for production", async () => {
		for (const siteEnv of [undefined, "", "local", "testing"]) {
			const mw = createAdminMiddleware({
				getEnv: () => ({ SITE_ENV: siteEnv }),
				isDev: false,
			});
			const { context } = createMockContext("http://localhost:4322/_emdash/admin");
			const res = await runMw(mw, context, async () => new Response("admin"));
			expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		}

		const prodMw = createAdminMiddleware({
			getEnv: () => ({ SITE_ENV: "production" }),
			isDev: false,
		});
		const { context } = createMockContext("http://localhost:4322/_emdash/admin");
		const res = await runMw(prodMw, context, async () => new Response("admin"));
		expect(res.headers.get("X-Robots-Tag")).toBeNull();
	});

	it("default exported onRequest reads process.env.SETUP_TOKEN and process.env.SITE_ENV", async () => {
		delete process.env.SETUP_TOKEN;
		process.env.SITE_ENV = "testing";

		const blocked = createMockContext("http://localhost:4322/_emdash/admin/setup");
		const resBlocked = await runMw(onRequest, blocked.context, async () => new Response("setup"));
		expect(resBlocked.status).toBe(404);

		process.env.SETUP_TOKEN = "env-secret";
		const authed = createMockContext("http://localhost:4322/_emdash/admin/setup", {
			[SETUP_GATE_COOKIE]: "env-secret",
		});
		const resAuthed = await runMw(onRequest, authed.context, async () => new Response("setup"));
		expect(resAuthed.status).toBe(200);
		expect(resAuthed.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
	});
});

describe("/healthz endpoint and outer middleware", () => {
	it("returns 200 JSON from GET and buildHealthzResponse", async () => {
		const res = buildHealthzResponse({ SITE_ENV: "testing" } as unknown as NodeJS.ProcessEnv);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		expect(await res.json()).toEqual({
			ok: true,
			status: "ok",
			service: "emdash-admin",
			environment: "testing",
		});

		const routeRes = await getHealthz({} as never);
		expect(routeRes.status).toBe(200);
	});

	it("short-circuits /healthz in outer middleware without calling next()", async () => {
		const next = vi.fn(async () => new Response("downstream"));
		const { context: healthCtx } = createMockContext("http://localhost:4322/healthz");
		const res = await runMw(healthzOuterMiddleware, healthCtx, next);
		expect(res.status).toBe(200);
		expect(next).not.toHaveBeenCalled();

		const { context: adminCtx } = createMockContext("http://localhost:4322/_emdash/admin");
		const passRes = await runMw(healthzOuterMiddleware, adminCtx, next);
		expect(passRes.status).toBe(200);
		expect(await passRes.text()).toBe("downstream");
		expect(next).toHaveBeenCalledTimes(1);
	});
});

describe("Cloudinary Node env wrapper", () => {
	it("returns a valid EmDash MediaProviderDescriptor", () => {
		const desc = cloudinaryMedia({ folder: "growgen" });
		expect(desc.id).toBe("cloudinary");
		expect(desc.name).toBe("Cloudinary");
		expect(desc.capabilities).toEqual({
			browse: true,
			search: false,
			upload: true,
			delete: true,
		});
		expect(desc.config).toEqual({ folder: "growgen" });
		expect(desc.entrypoint).toContain("cloudinary-media.ts");
	});

	it("looks up credentials from Node env and builds delivery/thumbnail URLs and API calls", async () => {
		const env = {
			CLOUDINARY_CLOUD_NAME: "demo-cloud",
			CLOUDINARY_API_KEY: "123456",
			CLOUDINARY_API_SECRET: "shh-secret",
		} as unknown as NodeJS.ProcessEnv;

		const lookup = createNodeEnvLookup(env);
		expect(lookup("CLOUDINARY_CLOUD_NAME")).toBe("demo-cloud");
		expect(lookup("MISSING_VAR")).toBeUndefined();

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			const resources = url.includes("/resources/image/upload")
				? [
						{
							public_id: "growgen/cover",
							format: "jpg",
							resource_type: "image",
							bytes: 1024,
							width: 800,
							height: 600,
						},
					]
				: [];
			return new Response(JSON.stringify({ resources }), { status: 200 });
		});

		const provider = createNodeCloudinaryProvider(
			{ folder: "growgen" },
			env,
			fetchMock as unknown as typeof fetch,
			() => 1_700_000_000,
		);

		expect(provider.getThumbnailUrl?.("growgen/cover", "image/jpeg", { width: 300 })).toBe(
			"https://res.cloudinary.com/demo-cloud/image/upload/c_fill,w_300,f_auto,q_auto/growgen/cover",
		);

		const listResult = await provider.list({ limit: 10 });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(listResult.items).toHaveLength(1);
		expect(listResult.items[0]?.id).toBe("growgen/cover");
	});

	it("throws when required Cloudinary env vars are missing", () => {
		const provider = createNodeCloudinaryProvider({}, {} as unknown as NodeJS.ProcessEnv);
		expect(() => provider.getThumbnailUrl?.("growgen/cover")).toThrow(/CLOUDINARY_CLOUD_NAME/);
	});
});

describe("rebuild-on-publish Node env wrapper", () => {
	it("returns a valid EmDash native PluginDescriptor", () => {
		const desc = rebuildOnPublish();
		expect(desc.id).toBe("rebuild-on-publish");
		expect(desc.format).toBe("native");
		expect(desc.entrypoint).toContain("rebuild-on-publish.ts");
	});

	it("reads dispatch env from Node process.env and dispatches on testing/production publish", async () => {
		const env = {
			GITHUB_DISPATCH_TOKEN: "ghp_test_token",
			GITHUB_DISPATCH_REPO: "gongbaodd/blog.gongbushang.com",
			GITHUB_API_URL: "https://api.github.com/",
			SITE_ENV: "testing",
		} as unknown as NodeJS.ProcessEnv;

		expect(readNodeDispatchEnv(env)).toEqual({
			GITHUB_DISPATCH_TOKEN: "ghp_test_token",
			GITHUB_DISPATCH_REPO: "gongbaodd/blog.gongbushang.com",
			GITHUB_API_URL: "https://api.github.com/",
			SITE_ENV: "testing",
		});

		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

		const plugin = createPlugin({ env, fetchImpl: fetchMock as unknown as typeof fetch });
		await plugin.hooks["content:afterPublish"]?.handler(
			{
				collection: "posts",
				content: { id: "post-1", slug: "hello-world" },
			} as never,
			{ log } as never,
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.github.com/repos/gongbaodd/blog.gongbushang.com/dispatches");
		expect(JSON.parse(init.body as string)).toEqual({
			event_type: "emdash-publish",
			client_payload: {
				environment: "testing",
				collection: "posts",
				id: "post-1",
				slug: "hello-world",
			},
		});
		expect(log.info).toHaveBeenCalledWith(expect.stringContaining("dispatched for posts/hello-world"));
	});

	it("skips dispatch when SITE_ENV is local or unset", async () => {
		const fetchMock = vi.fn();
		const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

		await dispatchFromNodeEnv(
			{ collection: "posts", id: "1", slug: "local-draft" },
			log,
			{
				GITHUB_DISPATCH_TOKEN: "ghp_test_token",
				GITHUB_DISPATCH_REPO: "gongbaodd/blog.gongbushang.com",
				SITE_ENV: "local",
			} as unknown as NodeJS.ProcessEnv,
			fetchMock as unknown as typeof fetch,
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(log.info).toHaveBeenCalledWith(expect.stringContaining("skipping"));
	});
});
