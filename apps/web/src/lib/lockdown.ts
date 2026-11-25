/**
 * Worker lockdown (D12, INF-7, SEC-04).
 *
 * The admin runs locally (`pnpm admin:<env>`) or in its own container (`apps/admin`), so a deployed
 * Cloudflare Worker serves static pages only and must never fall through to EmDash's runtime
 * `handler.fetch`. `assets.not_found_handling` does NOT keep asset misses away from the Worker
 * (verified on testing with `wrangler tail`), so `src/worker.ts` delegates every production `fetch`
 * to `handleStaticOnlyFetch` here.
 *
 * Pure and dependency-free so it can be unit tested in Node without Cloudflare/Astro virtual modules.
 */

const MAX_DECODE_PASSES = 3;
const ENCODED_HEX_RE = /%[0-9a-f]{2}/i;

/**
 * Canonicalize a request pathname for security checks:
 * - Iteratively `decodeURIComponent` up to 3 passes until stable, returning `null` on malformed
 *   percent-encoding, residual `%XX` hex pairs after 3 passes, or NUL bytes.
 * - Replace `\` with `/`, collapse repeated slashes, ensure a leading `/`, and resolve `.` / `..`
 *   dot segments via `URL`.
 * - Lowercase the resolved pathname.
 */
export function normalizePath(pathname: string): string | null {
  let decoded = pathname;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
  }

  if (ENCODED_HEX_RE.test(decoded) || decoded.includes("\0")) {
    return null;
  }

  const collapsed = decoded.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const withLeadingSlash = collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
  // Re-encode literal decoded `?` and `#` so `new URL` resolves dot segments on the full path
  // instead of truncating at query/fragment delimiters.
  const urlSafe = withLeadingSlash.replace(/\?/g, "%3F").replace(/#/g, "%23");

  try {
    return new URL(urlSafe, "http://localhost").pathname.toLowerCase();
  } catch {
    return null;
  }
}

const LOCKED = [/^\/_emdash(\/|$)/, /^\/\.well-known\/oauth/];

/** True when a deployed Worker must refuse the path. Undecodable/over-encoded paths are refused too. */
export function isLockedPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return p === null || LOCKED.some((re) => re.test(p));
}

export interface AssetsFetcher {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>;
}

export interface StaticWorkerEnv {
  ASSETS?: AssetsFetcher;
  SITE_ENV?: string;
}

export type WorkerFetchHandler<E = StaticWorkerEnv, C = unknown> = (
  request: Request,
  env: E,
  ctx: C,
) => Response | Promise<Response>;

function buildNotFoundHeaders(siteEnv: string | undefined, contentType?: string | null): Headers {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  if (siteEnv !== "production") {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return headers;
}

function bareNotFound(method: string, siteEnv: string | undefined): Response {
  return new Response(method === "HEAD" ? null : "Not found", {
    status: 404,
    headers: buildNotFoundHeaders(siteEnv),
  });
}

/**
 * Fail-closed static-only handler for deployed Workers (`!import.meta.env.DEV`).
 *
 * - Locked or malformed paths return a bare 404 (`cache-control: no-store`, plus `X-Robots-Tag`
 *   on non-production envs) without touching `ASSETS` or EmDash.
 * - Every other non-asset request tries to serve `/404.html` from `env.ASSETS` with HTTP 404
 *   (falling back to bare 404 if `/404.html` is unavailable) and NEVER invokes EmDash's runtime.
 */
export async function handleStaticOnlyFetch(
  request: Request,
  env?: StaticWorkerEnv,
): Promise<Response> {
  const siteEnv = env?.SITE_ENV;
  const method = request.method.toUpperCase();

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return bareNotFound(method, siteEnv);
  }

  if (isLockedPath(url.pathname)) {
    return bareNotFound(method, siteEnv);
  }

  if (env?.ASSETS) {
    try {
      const assetMethod = method === "HEAD" ? "HEAD" : "GET";
      const assetReq = new Request(new URL("/404.html", url.origin), { method: assetMethod });
      const assetRes = await env.ASSETS.fetch(assetReq);
      if (assetRes.ok) {
        return new Response(method === "HEAD" ? null : assetRes.body, {
          status: 404,
          headers: buildNotFoundHeaders(siteEnv, assetRes.headers.get("content-type")),
        });
      }
      await assetRes.body?.cancel().catch(() => {});
    } catch {
      // Fall through to bare 404 if ASSETS lookup fails.
    }
  }

  return bareNotFound(method, siteEnv);
}

/**
 * Create the Worker `fetch` handler:
 * - In local `astro dev` (`isDev: true`), delegate to EmDash's `fallbackFetch` so `pnpm admin:*` works.
 * - In deployed Workers (`isDev: false`), enforce fail-closed static-only behavior.
 */
export function createWorkerFetch<
  E extends StaticWorkerEnv = StaticWorkerEnv,
  C = unknown,
>(options: { isDev: boolean; fallbackFetch: WorkerFetchHandler<E, C> }): WorkerFetchHandler<E, C> {
  return (request, env, ctx) => {
    if (options.isDev) {
      return options.fallbackFetch(request, env, ctx);
    }
    return handleStaticOnlyFetch(request, env);
  };
}
