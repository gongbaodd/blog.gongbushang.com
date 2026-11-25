/**
 * Cloudinary request signing, resource-type inference, and URL/request builders.
 * Pure functions plus Web Crypto, so it runs on Workers and Node without the Node SDK.
 * Docs: Cloudinary "Authentication signatures" & "Upload API reference".
 */

/** Params that are never part of the signature. */
const UNSIGNED = new Set(["file", "cloud_name", "resource_type", "api_key"]);

export type CloudinaryResourceType = "image" | "video" | "raw";

export const CLOUDINARY_RESOURCE_TYPES: readonly CloudinaryResourceType[] = [
  "image",
  "video",
  "raw",
];

/** Map of lowercase file extension (without dot) to standard MIME type. */
export const MIME: Readonly<Record<string, string>> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
  // Video
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  "3gp": "video/3gpp",
  // Audio (stored under Cloudinary `video` resource_type)
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  // Documents, archives, data, fonts (`raw` resource_type)
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tgz: "application/gzip",
  tar: "application/x-tar",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  json: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  xml: "application/xml",
  rtf: "application/rtf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  epub: "application/epub+zip",
  vtt: "text/vtt",
  srt: "application/x-subrip",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  wasm: "application/wasm",
};

/** Extract lowercase extension (without leading dot) from a filename, public_id, or URL. */
export function extensionOf(name: string): string {
  const stripped = /^https?:\/\//i.test(name) ? (name.split(/[?#]/)[0] ?? "") : name;
  const base = stripped.split("/").pop() ?? stripped;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Normalize a MIME string by stripping parameters and lowercasing. */
export function normalizeMimeType(mime?: string): string {
  if (!mime) return "";
  return mime.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Map a normalized MIME type directly to a Cloudinary resource_type. */
function resourceTypeFromMime(mime: string): CloudinaryResourceType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return "video";
  return "raw";
}

/**
 * Infer Cloudinary `resource_type` from MIME type and/or filename extension.
 * - `image/*` -> `"image"`
 * - `video/*` & `audio/*` -> `"video"` (Cloudinary stores audio under `video`)
 * - PDFs, docs, archives, data, and other non-image/video/audio files -> `"raw"`
 *
 * When neither a specific MIME type nor a file extension is present, returns `fallback`
 * (`"raw"` on upload, `"image"` when inspecting extensionless legacy `public_id`s).
 */
export function inferResourceType(
  mimeType?: string,
  filename?: string,
  fallback: CloudinaryResourceType = "raw",
): CloudinaryResourceType {
  const normalized = normalizeMimeType(mimeType);
  if (normalized && normalized !== "application/octet-stream") {
    return resourceTypeFromMime(normalized);
  }
  const ext = filename ? extensionOf(filename) : "";
  if (ext) {
    const mapped = MIME[ext];
    return mapped ? resourceTypeFromMime(mapped) : "raw";
  }
  return fallback;
}

/**
 * Encode resource_type + public_id into a provider item `id`.
 * Images keep plain `public_id` for backwards compatibility with migrated `featured_image` values;
 * `video` and `raw` prefix `${resourceType}:${publicId}` so `get`, `delete`, `getEmbed`, and
 * `getThumbnailUrl` know the exact resource type from `id` alone.
 */
export function encodeMediaId(resourceType: CloudinaryResourceType, publicId: string): string {
  return resourceType === "image" ? publicId : `${resourceType}:${publicId}`;
}

export interface ParsedMediaId {
  resourceType: CloudinaryResourceType;
  publicId: string;
  explicit: boolean;
}

/** Parse a provider item `id` into `{ resourceType, publicId, explicit }`. */
export function parseMediaId(id: string): ParsedMediaId {
  const match = /^(image|video|raw):(.+)$/.exec(id);
  if (match) {
    return {
      resourceType: match[1] as CloudinaryResourceType,
      publicId: match[2],
      explicit: true,
    };
  }
  // Unprefixed ids are legacy image public_ids. A dot in the last segment ("growgen/v1.2/cover", "a.b") is not an
  // extension unless it is a known one; unknown extensions stay "image" instead of being mistaken for raw files.
  const ext = extensionOf(id);
  return {
    resourceType: ext && MIME[ext] ? inferResourceType(undefined, id, "image") : "image",
    publicId: id,
    explicit: false,
  };
}

export type SignParams = Record<string, string | number | boolean | undefined | null>;

/** `a=1&b=2` over sorted, non-empty, signable params. */
export function stringToSign(params: SignParams): string {
  return Object.keys(params)
    .filter((k) => !UNSIGNED.has(k))
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-1 hex of `stringToSign(params) + apiSecret`. */
export async function signParams(params: SignParams, apiSecret: string): Promise<string> {
  const data = new TextEncoder().encode(stringToSign(params) + apiSecret);
  return toHex(await crypto.subtle.digest("SHA-1", data));
}

/** Escape a value inside Cloudinary's `context` string (`k=v|k2=v2`). */
export function escapeContextValue(v: string): string {
  return v.replace(/([=|\\])/g, "\\$1");
}

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function apiBase(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}`;
}

export function basicAuth(c: CloudinaryCredentials): string {
  return `Basic ${btoa(`${c.apiKey}:${c.apiSecret}`)}`;
}

export interface UploadRequestInput {
  file: Blob;
  filename: string;
  folder?: string;
  alt?: string;
  timestamp: number;
  resourceType?: CloudinaryResourceType;
}

/** Build the signed multipart upload request (`/v1_1/<cloud>/<resource_type>/upload`). */
export async function buildUploadRequest(
  c: CloudinaryCredentials,
  input: UploadRequestInput,
): Promise<{ url: string; init: RequestInit; resourceType: CloudinaryResourceType }> {
  const resourceType =
    input.resourceType ?? inferResourceType(input.file.type, input.filename, "raw");
  const signed: SignParams = {
    folder: input.folder,
    timestamp: input.timestamp,
    unique_filename: true,
    use_filename: true,
    context: input.alt ? `alt=${escapeContextValue(input.alt)}` : undefined,
  };
  const signature = await signParams(signed, c.apiSecret);
  const form = new FormData();
  form.append("file", input.file, input.filename);
  form.append("api_key", c.apiKey);
  form.append("signature", signature);
  for (const [k, v] of Object.entries(signed)) {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  }
  return {
    url: `${apiBase(c.cloudName)}/${resourceType}/upload`,
    init: { method: "POST", body: form },
    resourceType,
  };
}

/** Build the signed destroy request (`/v1_1/<cloud>/<resource_type>/destroy`). */
export async function buildDestroyRequest(
  c: CloudinaryCredentials,
  publicId: string,
  timestamp: number,
  resourceType: CloudinaryResourceType = "image",
): Promise<{ url: string; init: RequestInit }> {
  const signed: SignParams = { public_id: publicId, timestamp, invalidate: true };
  const signature = await signParams(signed, c.apiSecret);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    invalidate: "true",
    api_key: c.apiKey,
    signature,
  });
  return {
    url: `${apiBase(c.cloudName)}/${resourceType}/destroy`,
    init: { method: "POST", body },
  };
}

export interface DeliveryUrlOptions {
  resourceType?: CloudinaryResourceType;
  width?: number;
  height?: number;
  format?: string;
  quality?: number | string;
  /** When true (audio under `video` resource_type), omit visual/image transforms. */
  audio?: boolean;
}

/**
 * Delivery URL per resource type:
 * - `image`: `/image/upload/f_auto,q_auto` (+ optional `c_fill,w_...,h_...`)
 * - `video`: `/video/upload/f_auto,q_auto` (+ optional `c_limit,w_...,h_...`), or clean `/video/upload/` for audio
 * - `raw`: `/raw/upload/<publicId>` with zero transforms
 */
export function deliveryUrl(
  cloudName: string,
  publicId: string,
  opts: DeliveryUrlOptions = {},
): string {
  const parsed = parseMediaId(publicId);
  const cleanId = parsed.publicId;
  const resourceType = opts.resourceType ?? parsed.resourceType;

  if (resourceType === "raw") {
    return `https://res.cloudinary.com/${cloudName}/raw/upload/${cleanId}`;
  }

  if (resourceType === "video") {
    if (opts.audio) {
      const t: string[] = [];
      if (opts.quality !== undefined) t.push(`q_${opts.quality}`);
      const fmt = opts.format && opts.format !== "auto" ? opts.format.toLowerCase() : "";
      const suffix = fmt && !cleanId.toLowerCase().endsWith(`.${fmt}`) ? `.${fmt}` : "";
      const transformPath = t.length > 0 ? `${t.join(",")}/` : "";
      return `https://res.cloudinary.com/${cloudName}/video/upload/${transformPath}${cleanId}${suffix}`;
    }
    const t: string[] = [];
    if (opts.width || opts.height) t.push("c_limit");
    if (opts.width) t.push(`w_${opts.width}`);
    if (opts.height) t.push(`h_${opts.height}`);
    t.push(`f_${opts.format && opts.format !== "auto" ? opts.format : "auto"}`);
    t.push(`q_${opts.quality ?? "auto"}`);
    return `https://res.cloudinary.com/${cloudName}/video/upload/${t.join(",")}/${cleanId}`;
  }

  const t: string[] = [];
  if (opts.width || opts.height) t.push("c_fill");
  if (opts.width) t.push(`w_${opts.width}`);
  if (opts.height) t.push(`h_${opts.height}`);
  t.push(`f_${opts.format && opts.format !== "auto" ? opts.format : "auto"}`);
  t.push(`q_${opts.quality ?? "auto"}`);
  return `https://res.cloudinary.com/${cloudName}/image/upload/${t.join(",")}/${cleanId}`;
}

/** Poster frame `.jpg` thumbnail URL for a Cloudinary video (`/video/upload/.../<publicId>.jpg`). */
export function videoPosterUrl(
  cloudName: string,
  publicId: string,
  opts: { width?: number; height?: number; quality?: number | string } = {},
): string {
  const cleanId = parseMediaId(publicId).publicId.replace(
    /\.(mp4|m4v|webm|mov|ogv|avi|mkv|mpeg|mpg|3gp)$/i,
    "",
  );
  const posterId = cleanId.toLowerCase().endsWith(".jpg") ? cleanId : `${cleanId}.jpg`;
  const t: string[] = [];
  if (opts.width || opts.height) t.push("c_fill");
  if (opts.width) t.push(`w_${opts.width}`);
  if (opts.height) t.push(`h_${opts.height}`);
  t.push("so_auto", `q_${opts.quality ?? "auto"}`);
  return `https://res.cloudinary.com/${cloudName}/video/upload/${t.join(",")}/${posterId}`;
}
