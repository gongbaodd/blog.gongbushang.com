/**
 * Setup-gate primitives shared by the Worker middleware (apps/web/src/middleware.ts) and the Node admin
 * (apps/admin/src/middleware.ts) (D11, SEC-04, SEC-15). Web Crypto only, so it runs on Workers and Node.
 */
export const SETUP_GATE_COOKIE = "growgen_setup_gate";

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

/** Lifetime of a setup-gate cookie, enforced server-side by the signed expiry (the cookie's maxAge is only a browser hint). */
export const SETUP_GATE_TTL_SECONDS = 3600;

const VALUE_RE = /^(\d{1,12})\.([0-9a-f]{64})$/;

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SetupGateCookieOptions {
  /** Current time in ms (test seam). */
  now?: number;
  /** Cookie name bound into the MAC, so a value minted for another cookie never verifies. */
  name?: string;
  ttlSeconds?: number;
}

/**
 * Cookie value `<exp>.<hex HMAC-SHA256(SETUP_TOKEN, "<name>|<exp>")>` (SEC-15). The raw SETUP_TOKEN is never stored, and the
 * value stops working at `exp` (unix seconds) whatever the browser does with maxAge.
 */
export async function issueSetupGateCookie(secret: string, opts: SetupGateCookieOptions = {}): Promise<string> {
  const now = opts.now ?? Date.now();
  const exp = Math.floor(now / 1000) + (opts.ttlSeconds ?? SETUP_GATE_TTL_SECONDS);
  return `${exp}.${await hmacHex(secret, `${opts.name ?? SETUP_GATE_COOKIE}|${exp}`)}`;
}

/** True only for a well-formed, unexpired value whose MAC matches (timing-safe). Expired, tampered or foreign values are false. */
export async function verifySetupGateCookie(
  value: string | null | undefined,
  secret: string,
  opts: SetupGateCookieOptions = {},
): Promise<boolean> {
  if (!value || !secret) return false;
  const m = VALUE_RE.exec(value);
  if (!m) return false;
  const exp = Number(m[1]);
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(exp) || exp <= nowSec) return false;
  // A signed exp further out than one TTL was not minted by issueSetupGateCookie (e.g. a stolen secret used offline): refuse.
  if (exp > nowSec + (opts.ttlSeconds ?? SETUP_GATE_TTL_SECONDS) + 60) return false;
  return matches(m[2], await hmacHex(secret, `${opts.name ?? SETUP_GATE_COOKIE}|${exp}`));
}

/** Constant-time comparison (both sides hashed first, so lengths never leak). */
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

/** Copy a (possibly immutable) response with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` (the 302 that consumes `?setup_token=`). */
export function hardenSetupRedirect(res: Response, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
