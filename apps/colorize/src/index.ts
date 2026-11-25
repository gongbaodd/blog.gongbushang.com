/**
 * Standalone Cloudflare Worker for cover image color extraction (`{ bgColor, titleColor }`).
 *
 * Endpoints:
 *   GET  /health              -> 200 { ok: true }
 *   POST /colorize            -> JSON body { url: string } -> 200 { bgColor, titleColor, thumbnailUrl }
 *   GET  /colorize?url=...    -> 200 { bgColor, titleColor, thumbnailUrl }
 */

import { toCloudinaryThumbnailUrl, UrlValidationError, validateImageUrl } from "./cloudinary.ts";
import { extractColorSet } from "./palette.ts";
import { decodePng, hasPngSignature, PngDecodeError } from "./png.ts";

export interface Env {
  /** Optional bearer token. When set, `/colorize` requires `Authorization: Bearer <token>`. */
  COLORIZE_TOKEN?: string;
  /** Optional comma-separated host allowlist (e.g. `res.cloudinary.com`). */
  ALLOWED_HOSTS?: string;
  /** Optional max response bytes override (default: 524288 = 512 KB). */
  MAX_IMAGE_BYTES?: string;
  /** Optional upstream fetch timeout in ms (default: 8000). */
  FETCH_TIMEOUT_MS?: string;
}

const DEFAULT_MAX_IMAGE_BYTES = 512 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

const textEncoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

/**
 * Constant-time string comparison over UTF-8 bytes to prevent timing attacks on bearer tokens.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = textEncoder.encode(a);
  const bufB = textEncoder.encode(b);
  const maxLen = Math.max(bufA.byteLength, bufB.byteLength);
  let diff = bufA.byteLength ^ bufB.byteLength;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return diff === 0;
}

function isAuthorized(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  return constantTimeEqual(match[1]!.trim(), expectedToken);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

class UpstreamFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamFetchError";
    this.status = status;
  }
}

async function readResponseBytesWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new UpstreamFetchError(
        `Upstream image exceeds maximum allowed size of ${maxBytes} bytes`,
        413,
      );
    }
  }

  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new UpstreamFetchError(
        `Upstream image exceeds maximum allowed size of ${maxBytes} bytes`,
        413,
      );
    }
    return buf;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UpstreamFetchError(
        `Upstream image exceeds maximum allowed size of ${maxBytes} bytes`,
        413,
      );
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function fetchImageBytes(
  initialUrl: string,
  env: Env,
  fetchFn: typeof fetch,
): Promise<Uint8Array> {
  const maxBytes = parsePositiveInt(env.MAX_IMAGE_BYTES, DEFAULT_MAX_IMAGE_BYTES);
  const timeoutMs = parsePositiveInt(env.FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = initialUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        res = await fetchFn(currentUrl, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { accept: "image/png,image/*;q=0.8" },
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new UpstreamFetchError(`Upstream fetch timed out after ${timeoutMs}ms`, 504);
        }
        throw new UpstreamFetchError(
          `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          502,
        );
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          throw new UpstreamFetchError(`Upstream redirect (${res.status}) missing Location`, 502);
        }
        if (hop === MAX_REDIRECTS) {
          throw new UpstreamFetchError("Too many upstream redirects", 502);
        }
        const resolved = new URL(location, currentUrl).toString();
        // Re-validate redirect target against SSRF rules
        validateImageUrl(resolved, { allowedHosts: env.ALLOWED_HOSTS });
        currentUrl = resolved;
        continue;
      }

      if (!res.ok) {
        throw new UpstreamFetchError(`Upstream image fetch returned HTTP ${res.status}`, 502);
      }

      return await readResponseBytesWithLimit(res, maxBytes);
    }

    throw new UpstreamFetchError("Too many upstream redirects", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleRequest(
  request: Request,
  env: Env = {},
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
    }
    return jsonResponse({ ok: true }, 200);
  }

  if (url.pathname === "/colorize") {
    if (request.method !== "POST" && request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET, POST" });
    }

    if (!isAuthorized(request, env.COLORIZE_TOKEN)) {
      return jsonResponse({ error: "Unauthorized" }, 401, { "www-authenticate": "Bearer" });
    }

    let rawImageUrl: unknown;
    if (request.method === "GET") {
      rawImageUrl = url.searchParams.get("url");
    } else {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }
      if (!body || typeof body !== "object" || !("url" in body)) {
        return jsonResponse({ error: "Request body must be a JSON object with a url field" }, 400);
      }
      rawImageUrl = (body as { url: unknown }).url;
    }

    if (typeof rawImageUrl !== "string" || !rawImageUrl.trim()) {
      return jsonResponse({ error: "Missing required url parameter" }, 400);
    }

    let validated: URL;
    try {
      validated = validateImageUrl(rawImageUrl, { allowedHosts: env.ALLOWED_HOSTS });
    } catch (err) {
      if (err instanceof UrlValidationError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      return jsonResponse({ error: "Invalid url" }, 400);
    }

    const thumbnailUrl = toCloudinaryThumbnailUrl(validated.toString());

    try {
      const bytes = await fetchImageBytes(thumbnailUrl, env, fetchFn);
      if (!hasPngSignature(bytes)) {
        return jsonResponse(
          { error: "Upstream response is not a PNG image (use a Cloudinary or PNG URL)" },
          415,
        );
      }
      const decoded = await decodePng(bytes);
      const { bgColor, titleColor } = extractColorSet(decoded.data);
      return jsonResponse({ bgColor, titleColor, thumbnailUrl }, 200);
    } catch (err) {
      if (err instanceof UrlValidationError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      if (err instanceof UpstreamFetchError) {
        return jsonResponse({ error: err.message }, err.status);
      }
      if (err instanceof PngDecodeError) {
        return jsonResponse({ error: `Invalid PNG image: ${err.message}` }, 415);
      }
      return jsonResponse(
        { error: err instanceof Error ? err.message : "Internal colorize error" },
        500,
      );
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env, fetch);
  },
};
