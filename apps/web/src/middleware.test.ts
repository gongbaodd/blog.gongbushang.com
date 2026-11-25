import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("astro:middleware", () => ({
  defineMiddleware: <T>(fn: T) => fn,
}));

import {
  SETUP_GATE_COOKIE,
  createWebMiddleware,
  deriveSetupGateToken,
  matches,
  shouldUseSecureCookie,
} from "./middleware";

type CookieOptions = Record<string, unknown>;

function createMockContext(urlStr: string, initialCookies: Record<string, string> = {}) {
  const jar = new Map<string, { value: string; options?: CookieOptions }>(
    Object.entries(initialCookies).map(([k, v]) => [k, { value: v }]),
  );
  const setCalls: Array<{ name: string; value: string; options?: CookieOptions }> = [];
  const url = new URL(urlStr);

  const context = {
    url,
    request: new Request(urlStr),
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

describe("apps/web middleware (SEC-04 path normalization & SEC-15 cookie hardening)", () => {
  it("matches tokens in constant time and rejects empty or mismatched values", async () => {
    expect(await matches("secret-123", "secret-123")).toBe(true);
    expect(await matches("secret-124", "secret-123")).toBe(false);
    expect(await matches(null, "secret-123")).toBe(false);
    expect(await matches(undefined, "secret-123")).toBe(false);
    expect(await matches("", "secret-123")).toBe(false);
    expect(await matches("secret-123", "")).toBe(false);
  });

  it("computes secure cookie flag correctly for HTTPS, loopback HTTP, and non-loopback HTTP", () => {
    expect(shouldUseSecureCookie(new URL("https://growgen.xyz/_emdash/admin/setup"))).toBe(true);
    expect(shouldUseSecureCookie(new URL("https://localhost:4322/_emdash/admin/setup"))).toBe(true);
    expect(shouldUseSecureCookie(new URL("http://localhost:4322/_emdash/admin/setup"))).toBe(false);
    expect(shouldUseSecureCookie(new URL("http://127.0.0.1:4322/_emdash/admin/setup"))).toBe(false);
    expect(shouldUseSecureCookie(new URL("http://growgen.xyz/_emdash/admin/setup"))).toBe(true);
  });

  it("blocks encoded dot-segment, backslash, and multi-encoded bypass attempts on setup paths", async () => {
    const mw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: "top-secret", SITE_ENV: "testing" }),
      isDev: false,
    });
    const next = vi.fn(async () => new Response("setup page"));

    for (const path of [
      "/_emdash/admin/setup",
      "/_emdash/admin/%2e/setup",
      "/%2e/_emdash/admin/setup",
      "/a/%2e%2e/_emdash/admin/setup",
      "/%5c_emdash/admin/setup",
      "/%255femdash/admin/setup",
      "/%252e/_emdash/admin/setup",
      "/_emdash/api/%73etup/status",
      "/a/%2e%2e/_emdash/api/setup",
    ]) {
      const { context } = createMockContext(`https://growgen.xyz${path}`);
      const res = await runMw(mw, context, next);
      expect(res.status).toBe(404);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed percent-encoding or >3 encoding passes", async () => {
    const mw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: "top-secret", SITE_ENV: "testing" }),
      isDev: false,
    });
    const next = vi.fn(async () => new Response("ok"));

    for (const badPath of ["/_emdash/admin/%ZZ", "/%2525255femdash/admin/setup"]) {
      const { context } = createMockContext("https://growgen.xyz/_emdash/admin/setup");
      Object.defineProperty(context.url, "pathname", { value: badPath });
      const res = await runMw(mw, context, next);
      expect(res.status).toBe(400);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("stores HMAC-SHA256 derived token (not raw SETUP_TOKEN) and sets no-store + no-referrer on 302", async () => {
    const secret = "super-secret-setup-token";
    const expectedDerived = await deriveSetupGateToken(secret);
    expect(expectedDerived).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedDerived).not.toBe(secret);

    const mw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: secret, SITE_ENV: "testing" }),
      isDev: false,
    });
    const next = vi.fn(async () => new Response("setup ok"));
    const { context, setCalls } = createMockContext(
      `https://growgen.xyz/_emdash/admin/setup?setup_token=${secret}&next=1`,
    );

    const res = await runMw(mw, context, next);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/_emdash/admin/setup?next=1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(setCalls).toEqual([
      {
        name: SETUP_GATE_COOKIE,
        value: expectedDerived,
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

  it("allows non-secure cookie only on loopback HTTP (localhost / 127.0.0.1)", async () => {
    const secret = "local-token";
    const mw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: secret, SITE_ENV: "local" }),
      isDev: false,
    });
    const next = vi.fn(async () => new Response("setup ok"));

    for (const host of ["localhost:4322", "127.0.0.1:4322"]) {
      const { context, setCalls } = createMockContext(
        `http://${host}/_emdash/admin/setup?setup_token=${secret}`,
      );
      const res = await runMw(mw, context, next);
      expect(res.status).toBe(302);
      expect(setCalls[0]?.options?.secure).toBe(false);
    }

    const remoteHttp = createMockContext(
      `http://growgen.xyz//_emdash/admin/setup?setup_token=${secret}`,
    );
    const remoteRes = await runMw(mw, remoteHttp.context, next);
    expect(remoteRes.status).toBe(302);
    expect(remoteRes.headers.get("Location")).toBe("/_emdash/admin/setup");
    expect(remoteHttp.setCalls[0]?.options?.secure).toBe(true);
  });

  it("accepts the derived cookie token and rejects the raw SETUP_TOKEN in the cookie", async () => {
    const secret = "my-setup-secret";
    const derived = await deriveSetupGateToken(secret);
    const mw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: secret, SITE_ENV: "testing" }),
      isDev: false,
    });
    const next = vi.fn(async () => new Response("setup ok", { status: 200 }));

    // Raw SETUP_TOKEN in cookie must be rejected
    const rawCookieCtx = createMockContext("https://growgen.xyz/_emdash/admin/setup", {
      [SETUP_GATE_COOKIE]: secret,
    });
    expect((await runMw(mw, rawCookieCtx.context, next)).status).toBe(404);
    expect(next).not.toHaveBeenCalled();

    // Derived cookie succeeds
    const derivedCookieCtx = createMockContext("https://growgen.xyz/_emdash/admin/setup", {
      [SETUP_GATE_COOKIE]: derived,
    });
    const okRes = await runMw(mw, derivedCookieCtx.context, next);
    expect(okRes.status).toBe(200);
    expect(await okRes.text()).toBe("setup ok");
    expect(okRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("bypasses setup gate in DEV mode and sets X-Robots-Tag only when SITE_ENV !== production", async () => {
    const devMw = createWebMiddleware({
      getEnv: () => ({ SETUP_TOKEN: undefined, SITE_ENV: "local" }),
      isDev: true,
    });
    const devCtx = createMockContext("http://localhost:4322/_emdash/admin/setup");
    const devRes = await runMw(devMw, devCtx.context, async () => new Response("dev setup"));
    expect(devRes.status).toBe(200);
    expect(devRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    const prodMw = createWebMiddleware({
      getEnv: () => ({ SITE_ENV: "production" }),
      isDev: false,
    });
    const prodCtx = createMockContext("https://growgen.xyz/");
    const prodRes = await runMw(prodMw, prodCtx.context, async () => new Response("home"));
    expect(prodRes.status).toBe(200);
    expect(prodRes.headers.get("X-Robots-Tag")).toBeNull();
  });
});
