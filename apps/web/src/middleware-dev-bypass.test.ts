import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("astro:middleware", () => ({ defineMiddleware: <T>(fn: T) => fn }));

import { createWebMiddleware } from "./middleware";
import { deriveSetupGateToken, hardenSetupRedirect } from "./lib/setup-gate";

function ctx(urlStr: string) {
  return {
    url: new URL(urlStr),
    request: new Request(urlStr),
    cookies: { get: () => undefined, set: () => {} },
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  };
}

type Mw = (c: never, next: () => Promise<Response>) => Promise<Response | void> | Response | void;
async function run(mw: Mw, c: unknown, next: () => Promise<Response>): Promise<Response> {
  const res = await mw(c as never, next);
  if (!res) throw new Error("no response");
  return res;
}

describe("apps/web middleware: EmDash dev-bypass never against production (SEC-07)", () => {
  const paths = [
    "/_emdash/api/auth/dev-bypass",
    "/_EMDASH/api/auth/dev-bypass?redirect=/_emdash/admin",
    "//_emdash//api/auth/%64ev-bypass",
    "/_emdash/api/auth/dev-bypass/",
  ];

  it("404s dev-bypass when SITE_ENV is production, even in dev mode", async () => {
    const mw = createWebMiddleware({ getEnv: () => ({ SITE_ENV: "production" }), isDev: true }) as Mw;
    const next = vi.fn(async () => new Response("session issued"));
    for (const p of paths) {
      const res = await run(mw, ctx(`http://localhost:4322${p}`), next);
      expect(res.status, p).toBe(404);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves dev-bypass alone for local dev, and other auth routes alone for production", async () => {
    const local = createWebMiddleware({ getEnv: () => ({ SITE_ENV: "local" }), isDev: true }) as Mw;
    expect((await run(local, ctx("http://localhost:4321/_emdash/api/auth/dev-bypass"), async () => new Response("ok"))).status).toBe(200);

    const prod = createWebMiddleware({ getEnv: () => ({ SITE_ENV: "production" }), isDev: true }) as Mw;
    expect((await run(prod, ctx("http://localhost:4322/_emdash/api/auth/me"), async () => new Response("me"))).status).toBe(200);
  });
});

describe("shared setup-gate helpers (SEC-15)", () => {
  it("derives a stable hex HMAC that differs from the secret", async () => {
    const a = await deriveSetupGateToken("s3cret-token");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(await deriveSetupGateToken("s3cret-token"));
    expect(a).not.toBe(await deriveSetupGateToken("other"));
  });

  it("hardens an immutable redirect with no-store and no-referrer", () => {
    const res = hardenSetupRedirect(Response.redirect("https://admin.example.test/_emdash/admin/setup", 302), { "X-Robots-Tag": "noindex" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://admin.example.test/_emdash/admin/setup");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});
