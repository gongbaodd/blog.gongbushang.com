import { describe, expect, it, vi } from "vitest";
import { buildDispatchRequest, dispatchOnPublish } from "./dispatch";

const env = { GITHUB_DISPATCH_TOKEN: "tok", GITHUB_DISPATCH_REPO: "o/r", SITE_ENV: "production" };
const info = { collection: "posts", id: "01X", slug: "hello" };
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("buildDispatchRequest", () => {
  it("builds the GitHub dispatch request", () => {
    const r = buildDispatchRequest(env, info)!;
    expect(r.url).toBe("https://api.github.com/repos/o/r/dispatches");
    expect(r.init.method).toBe("POST");
    expect((r.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(r.init.body as string)).toEqual({
      event_type: "emdash-publish",
      client_payload: { environment: "production", collection: "posts", id: "01X", slug: "hello" },
    });
  });
  it("does not dispatch for unset, local, the retired testing or unknown SITE_ENV", () => {
    for (const v of [undefined, "", "local", "testing", "prod", "Production", "production; rm"]) {
      expect(buildDispatchRequest({ ...env, SITE_ENV: v }, info)).toBeNull();
    }
  });
  it("allows https://api.github.com (with optional trailing slash) and rejects arbitrary GITHUB_API_URL", () => {
    for (const siteEnv of ["production"]) {
      expect(
        buildDispatchRequest(
          { ...env, SITE_ENV: siteEnv, GITHUB_API_URL: "https://api.github.com/" },
          info,
        )!.url,
      ).toBe("https://api.github.com/repos/o/r/dispatches");

      for (const badUrl of [
        "http://127.0.0.1:9/",
        "https://evil.example.com",
        "http://api.github.com",
        "https://api.github.com.evil.com",
        "https://api.github.com@evil.com",
        "https://user:pass@api.github.com",
        "https://api.github.com/extra",
        "https://api.github.com?x=1",
        "https://api.github.com#frag",
        "not-a-url",
      ]) {
        expect(
          buildDispatchRequest({ ...env, SITE_ENV: siteEnv, GITHUB_API_URL: badUrl }, info),
        ).toBeNull();
      }
    }
  });
  it("honours custom GITHUB_API_URL only when allowCustomApiUrl is explicitly set", () => {
    expect(
      buildDispatchRequest({ ...env, GITHUB_API_URL: "http://127.0.0.1:9/" }, info, {
        allowCustomApiUrl: true,
      })!.url,
    ).toBe("http://127.0.0.1:9/repos/o/r/dispatches");
    expect(
      buildDispatchRequest({ ...env, GITHUB_API_URL: "javascript:alert(1)" }, info, {
        allowCustomApiUrl: true,
      }),
    ).toBeNull();
  });
  it("returns null without token, repo or with a malformed repo", () => {
    expect(buildDispatchRequest({ GITHUB_DISPATCH_REPO: "o/r" }, info)).toBeNull();
    expect(buildDispatchRequest({ GITHUB_DISPATCH_TOKEN: "t" }, info)).toBeNull();
    expect(buildDispatchRequest({ ...env, GITHUB_DISPATCH_REPO: "../x" }, info)).toBeNull();
  });
});

describe("dispatchOnPublish", () => {
  it("no-ops with a log when unconfigured", async () => {
    const f = vi.fn(),
      l = log();
    await dispatchOnPublish({}, info, l, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
    expect(l.info).toHaveBeenCalled();
  });
  it("does not call fetch when SITE_ENV is local", async () => {
    const f = vi.fn(),
      l = log();
    await dispatchOnPublish({ ...env, SITE_ENV: "local" }, info, l, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });
  it("refuses to dispatch to a disallowed GITHUB_API_URL and never logs the token or URL", async () => {
    const f = vi.fn(),
      l = log();
    await dispatchOnPublish(
      { ...env, SITE_ENV: "production", GITHUB_API_URL: "https://evil.example.com" },
      info,
      l,
      f as unknown as typeof fetch,
    );
    expect(f).not.toHaveBeenCalled();
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining("disallowed GITHUB_API_URL"));
    expect(JSON.stringify(l.warn.mock.calls)).not.toContain("tok");
    expect(JSON.stringify(l.warn.mock.calls)).not.toContain("evil.example.com");
  });
  it("logs, never throws, on network error and non-204", async () => {
    const l = log();
    await expect(
      dispatchOnPublish(env, info, l, (async () => {
        throw new Error("boom");
      }) as unknown as typeof fetch),
    ).resolves.toBeUndefined();
    await dispatchOnPublish(
      env,
      info,
      l,
      (async () => new Response("bad", { status: 422 })) as unknown as typeof fetch,
    );
    expect(l.error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(l.error.mock.calls)).not.toContain("tok");
  });
  it("logs success on 204", async () => {
    const l = log();
    await dispatchOnPublish(
      env,
      info,
      l,
      (async () => new Response(null, { status: 204 })) as unknown as typeof fetch,
    );
    expect(l.info).toHaveBeenCalledWith(expect.stringContaining("dispatched"));
  });
});
