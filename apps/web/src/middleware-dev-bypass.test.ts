import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("astro:middleware", () => ({ defineMiddleware: <T>(fn: T) => fn }));

import { createWebMiddleware } from "./middleware";
import { SETUP_GATE_COOKIE, hardenSetupRedirect, issueSetupGateCookie, verifySetupGateCookie } from "./lib/setup-gate";

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
  const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);
  const SECRET = "s3cret-token";

  it("mints <exp>.<hmac> with a server-side expiry one TTL ahead, never the raw secret", async () => {
    const v = await issueSetupGateCookie(SECRET, { now: NOW });
    const [exp, mac] = v.split(".");
    expect(Number(exp)).toBe(NOW / 1000 + 3600);
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
    expect(v).not.toContain(SECRET);
  });

  it("accepts a valid value until it expires, then rejects it", async () => {
    const v = await issueSetupGateCookie(SECRET, { now: NOW });
    expect(await verifySetupGateCookie(v, SECRET, { now: NOW })).toBe(true);
    expect(await verifySetupGateCookie(v, SECRET, { now: NOW + 3599_000 })).toBe(true);
    expect(await verifySetupGateCookie(v, SECRET, { now: NOW + 3600_000 })).toBe(false);
    expect(await verifySetupGateCookie(v, SECRET, { now: NOW + 86_400_000 })).toBe(false);
  });

  it("rejects tampered values: changed exp, changed MAC, wrong secret, malformed", async () => {
    const v = await issueSetupGateCookie(SECRET, { now: NOW });
    const [exp, mac] = v.split(".") as [string, string];
    const flipped = mac.slice(0, -1) + (mac.endsWith("0") ? "1" : "0");
    for (const bad of [
      `${Number(exp) + 3600}.${mac}`, // extended expiry, old MAC
      `${exp}.${flipped}`,
      `${exp}.${mac.toUpperCase()}`,
      mac, // pre-SEC-15-fix format (MAC only)
      SECRET, // raw secret
      `${exp}.${mac}.x`,
      "",
    ]) {
      expect(await verifySetupGateCookie(bad, SECRET, { now: NOW }), bad).toBe(false);
    }
    expect(await verifySetupGateCookie(v, "other-secret", { now: NOW })).toBe(false);
  });

  it("rejects a value minted for another cookie name, or with an exp beyond one TTL", async () => {
    const other = await issueSetupGateCookie(SECRET, { now: NOW, name: "some_other_cookie" });
    expect(await verifySetupGateCookie(other, SECRET, { now: NOW })).toBe(false);
    expect(await verifySetupGateCookie(other, SECRET, { now: NOW, name: "some_other_cookie" })).toBe(true);
    expect(SETUP_GATE_COOKIE).toBe("growgen_setup_gate");
    const farFuture = await issueSetupGateCookie(SECRET, { now: NOW, ttlSeconds: 30 * 86_400 });
    expect(await verifySetupGateCookie(farFuture, SECRET, { now: NOW })).toBe(false);
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
