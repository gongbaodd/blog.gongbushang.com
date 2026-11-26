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
import {
  SETUP_GATE_COOKIE,
  SETUP_GATE_TTL_SECONDS,
  hardenSetupRedirect,
  issueSetupGateCookie,
  matches,
  shouldUseSecureCookie,
  verifySetupGateCookie,
} from "./lib/setup-gate";
import { isSiteLive } from "./lib/site-live";

export { SETUP_GATE_COOKIE, issueSetupGateCookie, matches, shouldUseSecureCookie, verifySetupGateCookie };
/** EmDash's dev-mode login without a passkey (SEC-07): refused whenever the dev server points at production. */
export const DEV_BYPASS_PATH = /^\/_emdash\/api\/auth\/dev-bypass(\/|$)/;
const GATED = [/^\/_emdash\/admin\/setup(\/|$)/, /^\/_emdash\/api\/setup(\/|$)/];

export interface WebMiddlewareEnv {
  SETUP_TOKEN?: string;
  /** Wrangler var; only the exact value "true" lifts noindex (INF-10). */
  PUBLIC_SITE_LIVE?: string;
  /** `production` for the deployed Worker and the (deprecated) `admin:production` dev server. */
  SITE_ENV?: string;
}

export interface WebMiddlewareOptions {
  getEnv?: () => WebMiddlewareEnv;
  isDev?: boolean;
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
    // SEC-07: `astro dev` exposes EmDash's dev-bypass login; never against the production database.
    if (DEV_BYPASS_PATH.test(pathname) && runtimeEnv.SITE_ENV?.trim() === "production") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (!GATED.some((re) => re.test(pathname))) return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);
    if (isDev) return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);

    const secret = runtimeEnv.SETUP_TOKEN;
    if (!secret) return new Response("Not found", { status: 404 });

    const queryToken = context.url.searchParams.get("setup_token");
    if (queryToken && (await matches(queryToken, secret))) {
      const cookieToken = await issueSetupGateCookie(secret);
      context.cookies.set(SETUP_GATE_COOKIE, cookieToken, {
        path: "/_emdash/",
        httpOnly: true,
        secure: shouldUseSecureCookie(context.url),
        sameSite: "strict",
        maxAge: SETUP_GATE_TTL_SECONDS,
      });
      const clean = new URL(context.url);
      clean.searchParams.delete("setup_token");
      return hardenSetupRedirect(
        context.redirect(pathname + clean.search, 302),
        isSiteLive(runtimeEnv.PUBLIC_SITE_LIVE) ? {} : { "X-Robots-Tag": "noindex, nofollow" },
      );
    }

    if (await verifySetupGateCookie(context.cookies.get(SETUP_GATE_COOKIE)?.value, secret)) {
      return withRobots(next, runtimeEnv.PUBLIC_SITE_LIVE);
    }
    return new Response("Not found", { status: 404 });
  });
}

export const onRequest = createWebMiddleware();
