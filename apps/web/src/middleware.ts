/**
 * First-admin setup gate (D11, SEC-04, SEC-15).
 *
 * EmDash has no built-in lock on the setup wizard: on a fresh DB the first visitor to
 * /_emdash/admin/setup who completes passkey registration becomes admin. This gate returns 404 for the
 * setup page and setup API unless the visitor presents the SETUP_TOKEN Worker secret, first as
 * `?setup_token=...` (which sets an httpOnly cookie containing an HMAC-SHA256 derived token, then
 * redirects to the clean URL) and afterwards via that cookie. No SETUP_TOKEN configured => setup is
 * closed (fail closed), except in `astro dev`.
 */
import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";
import { normalizePath } from "./lib/lockdown";
import { isSiteLive } from "./lib/site-live";

export const SETUP_GATE_COOKIE = "growgen_setup_gate";
const GATED = [/^\/_emdash\/admin\/setup(\/|$)/, /^\/_emdash\/api\/setup(\/|$)/];

export interface WebMiddlewareEnv {
  SETUP_TOKEN?: string;
  /** Wrangler var; only the exact value "true" lifts noindex (INF-10). */
  PUBLIC_SITE_LIVE?: string;
}

export interface WebMiddlewareOptions {
  getEnv?: () => WebMiddlewareEnv;
  isDev?: boolean;
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Derive the cookie value via HMAC-SHA256 so the raw `SETUP_TOKEN` is never stored in cookies. */
export async function deriveSetupGateToken(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(SETUP_GATE_COOKIE)),
  );
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function matches(
  candidate: string | null | undefined,
  expected: string,
): Promise<boolean> {
  if (!candidate || !expected) return false;
  const [a, b] = await Promise.all([digest(candidate), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Set `Secure` unless running over HTTP on loopback (`localhost` / `127.0.0.1`). */
export function shouldUseSecureCookie(url: URL): boolean {
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return url.protocol === "https:" || !isLoopback;
}

/** Non-live sites (PUBLIC_SITE_LIVE != "true"): noindex on dynamic (SSR) responses too. Static assets get it from dist/client/_headers. */
async function withRobots(
  next: () => Promise<Response>,
  siteLive: string | undefined,
): Promise<Response> {
  const res = await next();
  if (!isSiteLive(siteLive)) {
    try {
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
    } catch {
      // immutable headers (e.g. redirect responses from assets): ignore
    }
  }
  return res;
}

const defaultIsDev = Boolean(import.meta.env?.DEV && !import.meta.env?.VITEST);

export function createWebMiddleware(options: WebMiddlewareOptions = {}) {
  const getEnv = options.getEnv ?? (() => env as unknown as WebMiddlewareEnv);
  const isDev = options.isDev ?? defaultIsDev;

  return defineMiddleware(async (context, next) => {
    const pathname = normalizePath(context.url.pathname);
    if (pathname === null) return new Response("Bad request", { status: 400 });

    const runtimeEnv = getEnv();
    if (!GATED.some((re) => re.test(pathname))) return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);
    if (isDev) return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);

    const secret = runtimeEnv.SETUP_TOKEN;
    if (!secret) return new Response("Not found", { status: 404 });

    const queryToken = context.url.searchParams.get("setup_token");
    if (queryToken && (await matches(queryToken, secret))) {
      const cookieToken = await deriveSetupGateToken(secret);
      context.cookies.set(SETUP_GATE_COOKIE, cookieToken, {
        path: "/_emdash/",
        httpOnly: true,
        secure: shouldUseSecureCookie(context.url),
        sameSite: "strict",
        maxAge: 3600,
      });
      const clean = new URL(context.url);
      clean.searchParams.delete("setup_token");
      const redirectRes = context.redirect(pathname + clean.search, 302);
      const headers = new Headers(redirectRes.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("Referrer-Policy", "no-referrer");
      if (!isSiteLive(runtimeEnv.PUBLIC_SITE_LIVE)) {
        headers.set("X-Robots-Tag", "noindex, nofollow");
      }
      return new Response(redirectRes.body, {
        status: redirectRes.status,
        statusText: redirectRes.statusText,
        headers,
      });
    }

    const expectedCookie = await deriveSetupGateToken(secret);
    if (await matches(context.cookies.get(SETUP_GATE_COOKIE)?.value, expectedCookie)) {
      return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);
    }
    return new Response("Not found", { status: 404 });
  });
}

export const onRequest = createWebMiddleware();
