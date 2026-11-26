/**
 * Setup-gate primitives shared by the Worker middleware (apps/web/src/middleware.ts) and the Node admin
 * (apps/admin/src/middleware.ts) (D11, SEC-04, SEC-15). Web Crypto only, so it runs on Workers and Node.
 */
export const SETUP_GATE_COOKIE = "growgen_setup_gate";

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
