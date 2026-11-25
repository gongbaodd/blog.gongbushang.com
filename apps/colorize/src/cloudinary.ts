/**
 * Cloudinary thumbnail URL rewriter and SSRF-safe URL validator.
 */

export class UrlValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UrlValidationError";
    this.status = status;
  }
}

export const CLOUDINARY_THUMBNAIL_TRANSFORM = "f_png,w_32,h_32,c_limit";

const CLOUDINARY_HOST = "res.cloudinary.com";
const CLOUDINARY_UPLOAD_RE = /^\/([^/]+)\/image\/upload\/(.+)$/;

/**
 * Heuristic for a Cloudinary transformation segment (e.g. `f_auto,q_auto`, `w_1200`, `c_fill,h_600`).
 * Distinguishes transform segments from version (`v1700000000`), signed (`s--...--`), and public IDs.
 */
const CLOUDINARY_TRANSFORM_TOKEN_RE =
  /^(?:a|ac|af|ar|b|bo|c|co|cs|d|dl|dn|dpr|du|e|eo|f|fl|fps|g|h|if|ki|l|o|p|pg|q|r|so|t|u|vc|vs|w|x|y|z)_[^/]+$/;

function isTransformSegment(segment: string): boolean {
  if (!segment) return false;
  const tokens = segment.split(",");
  return tokens.every((tok) => CLOUDINARY_TRANSFORM_TOKEN_RE.test(tok));
}

/**
 * Rewrites `res.cloudinary.com/.../image/upload/...` URLs into a tiny 32x32 PNG
 * thumbnail (`f_png,w_32,h_32,c_limit`) so decoding stays under ~1,024 pixels.
 *
 * Non-Cloudinary URLs and signed Cloudinary URLs (`s--...--`) are returned unchanged.
 */
export function toCloudinaryThumbnailUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.hostname.toLowerCase() !== CLOUDINARY_HOST) {
    return url.toString();
  }

  const match = CLOUDINARY_UPLOAD_RE.exec(url.pathname);
  if (!match) {
    return url.toString();
  }

  const cloudName = match[1]!;
  const rest = match[2]!;
  const segments = rest.split("/");

  // Do not rewrite signed delivery URLs (`s--xxxxxxxx--/...`), as altering transforms breaks the signature.
  if (segments[0] && /^s--[A-Za-z0-9_-]+--$/.test(segments[0])) {
    return url.toString();
  }

  // Drop existing leading transformation segments so our tiny PNG transform takes full effect.
  let publicIdStart = 0;
  while (publicIdStart < segments.length - 1 && isTransformSegment(segments[publicIdStart]!)) {
    publicIdStart++;
  }

  const tail = segments.slice(publicIdStart).join("/");
  const rewritten = new URL(url.toString());
  rewritten.pathname = `/${cloudName}/image/upload/${CLOUDINARY_THUMBNAIL_TRANSFORM}/${tail}`;
  return rewritten.toString();
}

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/**
 * Parse IPv4 literals in dotted-decimal, hex, octal, or shorthand integer forms.
 * Returns a 4-tuple of octets if `host` is an IPv4 literal, or `null` otherwise.
 */
function parseIpv4Literal(host: string): readonly [number, number, number, number] | null {
  if (!/^[0-9a-fA-FxX.]+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const part of parts) {
    if (part === "") return null;
    let val: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) {
      val = Number.parseInt(part.slice(2), 16);
    } else if (/^0[0-7]+$/.test(part)) {
      val = Number.parseInt(part, 8);
    } else if (/^\d+$/.test(part)) {
      val = Number.parseInt(part, 10);
    } else {
      return null;
    }
    if (!Number.isSafeInteger(val) || val < 0) return null;
    nums.push(val);
  }

  // Convert shorthand IPv4 formats (e.g. 127.1, 2130706433) to 32-bit integer
  let addr: number;
  if (nums.length === 1) {
    if (nums[0]! > 0xffffffff) return null;
    addr = nums[0]!;
  } else if (nums.length === 2) {
    if (nums[0]! > 0xff || nums[1]! > 0xffffff) return null;
    addr = (nums[0]! << 24) | nums[1]!;
  } else if (nums.length === 3) {
    if (nums[0]! > 0xff || nums[1]! > 0xff || nums[2]! > 0xffff) return null;
    addr = (nums[0]! << 24) | (nums[1]! << 16) | nums[2]!;
  } else {
    if (nums.some((n) => n > 0xff)) return null;
    addr = (nums[0]! << 24) | (nums[1]! << 16) | (nums[2]! << 8) | nums[3]!;
  }

  const u = addr >>> 0;
  return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff];
}

function isPrivateOrReservedIpv4(octets: readonly [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol / TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast
  return false;
}

function parseIpv6ToHextets(raw: string): number[] | null {
  const host = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  // Strip optional zone id (%eth0)
  const clean = host.split("%")[0]!.toLowerCase();
  if (!clean.includes(":")) return null;

  // Handle IPv4-embedded suffix (e.g. ::ffff:127.0.0.1)
  const lastColon = clean.lastIndexOf(":");
  const tail = clean.slice(lastColon + 1);
  let normalized = clean;
  if (tail.includes(".")) {
    const ipv4 = parseIpv4Literal(tail);
    if (!ipv4) return null;
    const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = `${clean.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const parsePart = (part: string): number[] | null => {
    if (!part) return [];
    const segs = part.split(":");
    const out: number[] = [];
    for (const seg of segs) {
      if (!/^[0-9a-f]{1,4}$/.test(seg)) return null;
      out.push(Number.parseInt(seg, 16));
    }
    return out;
  };

  const left = parsePart(halves[0]!);
  if (!left) return null;
  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }

  const right = parsePart(halves[1]!);
  if (!right) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function isPrivateOrReservedIpv6(hextets: number[]): boolean {
  const allZeroExceptLast =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0;

  // :: (unspecified) and ::1 (loopback)
  if (allZeroExceptLast && hextets[6] === 0 && (hextets[7] === 0 || hextets[7] === 1)) {
    return true;
  }

  // ::ffff:0:0/96 IPv4-mapped IPv6
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  ) {
    const hi = hextets[6]!;
    const lo = hextets[7]!;
    return isPrivateOrReservedIpv4([(hi >>> 8) & 0xff, hi & 0xff, (lo >>> 8) & 0xff, lo & 0xff]);
  }

  const first = hextets[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && hextets[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

function matchesAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  for (const pattern of allowedHosts) {
    const normalized = pattern.trim().toLowerCase().replace(/\.$/, "");
    if (!normalized) continue;
    if (normalized === "*") return true;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1); // ".example.com"
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) {
        return true;
      }
    } else if (hostname === normalized) {
      return true;
    }
  }
  return false;
}

export interface ValidateUrlOptions {
  /**
   * Optional comma-separated list of allowed hostnames (e.g. `"res.cloudinary.com"`
   * or `"res.cloudinary.com,*.example.com"`). Pass `"*"` or omit to allow any safe public HTTP(S) host.
   */
  allowedHosts?: string;
}

/**
 * Validates that a URL is safe to fetch from the Worker (SSRF protection).
 * Returns the parsed `URL` on success, or throws `UrlValidationError`.
 */
export function validateImageUrl(rawUrl: string, options: ValidateUrlOptions = {}): URL {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new UrlValidationError("Missing or empty url parameter");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new UrlValidationError("Invalid URL syntax");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlValidationError(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  if (parsed.username || parsed.password) {
    throw new UrlValidationError("URL credentials are not allowed");
  }

  const rawHost = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!rawHost) {
    throw new UrlValidationError("URL is missing a hostname");
  }

  if (
    BLOCKED_HOSTNAMES.has(rawHost) ||
    rawHost.endsWith(".localhost") ||
    rawHost.endsWith(".local") ||
    rawHost.endsWith(".internal")
  ) {
    throw new UrlValidationError(`Blocked hostname: ${rawHost}`);
  }

  // IPv6 literal check
  if (rawHost.startsWith("[") || rawHost.includes(":")) {
    const hextets = parseIpv6ToHextets(rawHost);
    if (!hextets || isPrivateOrReservedIpv6(hextets)) {
      throw new UrlValidationError(`Blocked IPv6 address: ${rawHost}`);
    }
  } else {
    // IPv4 literal check (including decimal/hex/octal shorthand)
    const ipv4 = parseIpv4Literal(rawHost);
    if (ipv4 && isPrivateOrReservedIpv4(ipv4)) {
      throw new UrlValidationError(`Blocked private or loopback IP address: ${rawHost}`);
    }
  }

  if (options.allowedHosts && options.allowedHosts.trim() !== "") {
    const patterns = options.allowedHosts
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (patterns.length > 0 && !matchesAllowedHost(rawHost, patterns)) {
      throw new UrlValidationError(`Hostname "${rawHost}" is not in ALLOWED_HOSTS`);
    }
  }

  return parsed;
}
