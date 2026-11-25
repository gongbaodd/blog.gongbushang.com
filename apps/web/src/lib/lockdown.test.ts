import { describe, expect, it, vi } from "vitest";
import {
  createWorkerFetch,
  handleStaticOnlyFetch,
  isLockedPath,
  normalizePath,
  type StaticWorkerEnv,
} from "./lockdown";

describe("normalizePath (SEC-04 path canonicalization)", () => {
  it("normalizes case, duplicate slashes, backslashes, and encoded dot segments", () => {
    expect(normalizePath("/_EMDASH//admin///%73etup")).toBe("/_emdash/admin/setup");
    expect(normalizePath("/%2e/_emdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/a/%2e%2e/_emdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/_emdash/admin/%2e/setup")).toBe("/_emdash/admin/setup");
    expect(normalizePath("/_emdash/admin/foo/%2e%2e/setup")).toBe("/_emdash/admin/setup");
    expect(normalizePath("/%5c_emdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/_emdash\\admin\\setup")).toBe("/_emdash/admin/setup");
    expect(normalizePath("/%255femdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/%252e/_emdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/%25255femdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/%3f/%2e%2e/_emdash/admin")).toBe("/_emdash/admin");
    expect(normalizePath("/_emdash/admin/%23/%2e%2e/setup")).toBe("/_emdash/admin/setup");
    expect(normalizePath("_emdash/admin")).toBe("/_emdash/admin");
  });

  it("returns null on malformed URI, >3 encoding passes, or NUL bytes", () => {
    expect(normalizePath("/%ZZ")).toBeNull();
    expect(normalizePath("/_emdash/%zz")).toBeNull();
    expect(normalizePath("/_emdash/admin/%E0%A4%A")).toBeNull();
    expect(normalizePath("/%2525255femdash/admin")).toBeNull();
    expect(normalizePath("/%2525252e/_emdash/admin")).toBeNull();
    expect(normalizePath("/_emdash%00/admin")).toBeNull();
  });
});

describe("isLockedPath (D12 / SEC-04 Worker lockdown)", () => {
  it.each([
    "/_emdash",
    "/_emdash/",
    "/_emdash/admin",
    "/_emdash/admin/setup",
    "/_emdash/api/auth/me",
    "/_emdash/api/setup/status",
    "/_EMDASH/admin",
    "/%5Femdash/api/auth/me",
    "/_emdash/api/%73etup",
    "//_emdash//api/manifest",
    "/%2e/_emdash/admin",
    "/a/%2e%2e/_emdash/admin",
    "/_emdash/admin/%2e/setup",
    "/%5c_emdash/admin",
    "/%255femdash/admin",
    "/%252e/_emdash/admin",
    "/%2525255femdash/admin",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/_emdash/api/mcp",
    "/%2e/.well-known/oauth-authorization-server",
    "/%ZZ",
    "/_emdash/%zz",
  ])("locks %s", (p) => expect(isLockedPath(p)).toBe(true));

  it.each([
    "/",
    "/tech/2026/11/24/leetcode/",
    "/api/cards/latest.json",
    "/_astro/app.js",
    "/emdash-notes/",
    "/.well-known/security.txt",
    "/robots.txt",
  ])("serves %s", (p) => expect(isLockedPath(p)).toBe(false));
});

describe("createWorkerFetch / handleStaticOnlyFetch (SEC-04 fail-closed static Worker)", () => {
  it("never calls fallback handler.fetch in prod mode on locked paths or arbitrary 404s", async () => {
    const fallbackFetch = vi.fn(async () => new Response("emdash ssr", { status: 200 }));
    const assetsFetch = vi.fn(
      async () =>
        new Response("<!doctype html><h1>Custom 404</h1>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const workerFetch = createWorkerFetch({ isDev: false, fallbackFetch });
    const env: StaticWorkerEnv = {
      ASSETS: { fetch: assetsFetch },
      SITE_ENV: "production",
    };

    // Random non-asset 404 serves /404.html from ASSETS with 404 status and no-store
    const randomRes = await workerFetch(new Request("https://growgen.xyz/random-404"), env, {});
    expect(randomRes.status).toBe(404);
    expect(randomRes.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(randomRes.headers.get("cache-control")).toBe("no-store");
    expect(randomRes.headers.get("X-Robots-Tag")).toBeNull();
    expect(await randomRes.text()).toContain("Custom 404");
    expect(assetsFetch).toHaveBeenCalledTimes(1);
    const [assetReq] = assetsFetch.mock.calls[0] as unknown as [Request];
    expect(new URL(assetReq.url).pathname).toBe("/404.html");
    expect(assetReq.method).toBe("GET");

    // Locked paths return bare 404 without calling ASSETS or fallbackFetch
    for (const path of [
      "/_emdash/admin",
      "/%2e/_emdash/admin",
      "/a/%2e%2e/_emdash/admin",
      "/%5c_emdash/admin",
      "/%255femdash/admin",
      "/%252e/_emdash/admin",
      "/%ZZ",
    ]) {
      const res = await workerFetch(new Request(`https://growgen.xyz${path}`), env, {});
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("X-Robots-Tag")).toBeNull();
      expect(await res.text()).toBe("Not found");
    }

    expect(assetsFetch).toHaveBeenCalledTimes(1);
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it("sets X-Robots-Tag: noindex, nofollow on non-production and unset SITE_ENV", async () => {
    const assetsFetch = vi.fn(
      async () =>
        new Response("<h1>404</h1>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );

    for (const siteEnv of ["testing", "soak", "", undefined]) {
      const env: StaticWorkerEnv = { ASSETS: { fetch: assetsFetch }, SITE_ENV: siteEnv };

      const lockedRes = await handleStaticOnlyFetch(
        new Request("https://next.growgen.xyz/_emdash/admin"),
        env,
      );
      expect(lockedRes.status).toBe(404);
      expect(lockedRes.headers.get("cache-control")).toBe("no-store");
      expect(lockedRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

      const pageRes = await handleStaticOnlyFetch(
        new Request("https://next.growgen.xyz/does-not-exist"),
        env,
      );
      expect(pageRes.status).toBe(404);
      expect(pageRes.headers.get("cache-control")).toBe("no-store");
      expect(pageRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(pageRes.headers.get("content-type")).toBe("text/html; charset=utf-8");
    }
  });

  it("uses GET for POST misses and HEAD with empty body for HEAD misses", async () => {
    const assetsFetch = vi.fn(
      async (input: Request | URL | string) =>
        new Response(input instanceof Request && input.method === "HEAD" ? null : "<h1>404</h1>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    const env: StaticWorkerEnv = { ASSETS: { fetch: assetsFetch }, SITE_ENV: "production" };

    const postRes = await handleStaticOnlyFetch(
      new Request("https://growgen.xyz/missing", { method: "POST", body: "x=1" }),
      env,
    );
    expect(postRes.status).toBe(404);
    expect(await postRes.text()).toBe("<h1>404</h1>");
    expect((assetsFetch.mock.calls[0]?.[0] as Request).method).toBe("GET");

    const headRes = await handleStaticOnlyFetch(
      new Request("https://growgen.xyz/missing", { method: "HEAD" }),
      env,
    );
    expect(headRes.status).toBe(404);
    expect(await headRes.text()).toBe("");
    expect((assetsFetch.mock.calls[1]?.[0] as Request).method).toBe("HEAD");
  });

  it("falls back to bare 404 when ASSETS has no /404.html, is missing, or throws", async () => {
    const missingAssetEnv: StaticWorkerEnv = {
      ASSETS: { fetch: vi.fn(async () => new Response("nope", { status: 404 })) },
      SITE_ENV: "testing",
    };
    const res1 = await handleStaticOnlyFetch(
      new Request("https://growgen.xyz/missing"),
      missingAssetEnv,
    );
    expect(res1.status).toBe(404);
    expect(res1.headers.get("cache-control")).toBe("no-store");
    expect(res1.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(await res1.text()).toBe("Not found");

    const throwingEnv: StaticWorkerEnv = {
      ASSETS: {
        fetch: vi.fn(async () => {
          throw new Error("assets unavailable");
        }),
      },
      SITE_ENV: "production",
    };
    const res2 = await handleStaticOnlyFetch(
      new Request("https://growgen.xyz/missing"),
      throwingEnv,
    );
    expect(res2.status).toBe(404);
    expect(await res2.text()).toBe("Not found");

    const res3 = await handleStaticOnlyFetch(new Request("https://growgen.xyz/missing"), {});
    expect(res3.status).toBe(404);
    expect(await res3.text()).toBe("Not found");
  });

  it("returns bare 404 on invalid request URL without calling fallbackFetch", async () => {
    const fallbackFetch = vi.fn(async () => new Response("ssr", { status: 200 }));
    const workerFetch = createWorkerFetch({ isDev: false, fallbackFetch });
    const badReq = { url: "not a valid url", method: "GET" } as unknown as Request;

    const res = await workerFetch(badReq, { SITE_ENV: "testing" }, {});
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it("delegates to fallback handler.fetch in DEV mode so local pnpm admin:* keeps working", async () => {
    const fallbackFetch = vi.fn(async () => new Response("dev emdash", { status: 200 }));
    const workerFetch = createWorkerFetch({ isDev: true, fallbackFetch });
    const env: StaticWorkerEnv = { SITE_ENV: "local" };

    const res = await workerFetch(new Request("http://localhost:4322/_emdash/admin"), env, {});
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("dev emdash");
    expect(fallbackFetch).toHaveBeenCalledTimes(1);
  });
});
