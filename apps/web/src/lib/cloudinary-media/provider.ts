import type {
  CreateMediaProviderFn,
  EmbedOptions,
  MediaListOptions,
  MediaProvider,
  MediaProviderItem,
  MediaUploadInput,
  MediaValue,
} from "emdash/media";
import {
  CLOUDINARY_RESOURCE_TYPES,
  MIME,
  apiBase,
  basicAuth,
  buildDestroyRequest,
  buildUploadRequest,
  deliveryUrl,
  encodeMediaId,
  extensionOf,
  normalizeMimeType,
  parseMediaId,
  videoPosterUrl,
  type CloudinaryCredentials,
  type CloudinaryResourceType,
} from "./sign";

export interface CloudinaryMediaConfig {
  /** Only list/upload under this folder. Default "growgen". */
  folder?: string;
  /** Env var names (defaults CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET). */
  cloudNameEnvVar?: string;
  apiKeyEnvVar?: string;
  apiSecretEnvVar?: string;
  /** Max upload size in bytes (Worker buffers uploads in memory). Default 10 MB. */
  maxBytes?: number;
}

export type EnvLookup = (name: string) => string | undefined;

interface CloudinaryResource {
  public_id: string;
  asset_folder?: string;
  display_name?: string;
  format?: string;
  resource_type?: string;
  is_audio?: boolean;
  bytes?: number;
  width?: number;
  height?: number;
  created_at?: string;
  secure_url?: string;
  context?: { custom?: { alt?: string } };
}

const CURSOR_PREFIX = "cld1:";

function normalizeResourceType(
  value: unknown,
  fallback: CloudinaryResourceType = "image",
): CloudinaryResourceType {
  if (value === "image" || value === "video" || value === "raw") return value;
  return fallback;
}

function isAudioExtension(ext: string): boolean {
  const m = MIME[ext.toLowerCase()];
  return Boolean(m?.startsWith("audio/"));
}

function mimeOf(r: CloudinaryResource): string {
  const t = normalizeResourceType(r.resource_type, "image");
  const ext = (
    r.format ||
    extensionOf(r.public_id) ||
    extensionOf(r.display_name ?? "")
  ).toLowerCase();
  if (t === "video" && r.is_audio && ext === "webm") return "audio/webm";
  if (ext && MIME[ext]) return MIME[ext];
  if (t === "image") return ext ? `image/${ext}` : "image/*";
  if (t === "video") {
    if (r.is_audio) return ext ? `audio/${ext}` : "audio/*";
    return ext ? `video/${ext}` : "video/*";
  }
  return "application/octet-stream";
}

function parseMimeTokens(mimeFilter?: string): string[] {
  if (!mimeFilter) return [];
  return mimeFilter
    .split(",")
    .map((part) => normalizeMimeType(part))
    .filter(Boolean);
}

/** Determine which Cloudinary resource_type endpoints to query for an optional `mimeType` filter. */
function targetResourceTypes(mimeFilter?: string): CloudinaryResourceType[] {
  const tokens = parseMimeTokens(mimeFilter);
  if (tokens.length === 0) return [...CLOUDINARY_RESOURCE_TYPES];

  const needed = new Set<CloudinaryResourceType>();
  for (const token of tokens) {
    if (token === "*" || token === "*/*") {
      return [...CLOUDINARY_RESOURCE_TYPES];
    }
    if (token.startsWith("image/")) {
      needed.add("image");
    } else if (token.startsWith("video/") || token.startsWith("audio/")) {
      needed.add("video");
    } else if (token.startsWith(".")) {
      const mapped = MIME[token.slice(1)];
      if (!mapped) needed.add("raw");
      else if (mapped.startsWith("image/")) needed.add("image");
      else if (mapped.startsWith("video/") || mapped.startsWith("audio/")) needed.add("video");
      else needed.add("raw");
    } else {
      needed.add("raw");
    }
  }
  return CLOUDINARY_RESOURCE_TYPES.filter((t) => needed.has(t));
}

function matchesMimeFilter(itemMime: string, mimeFilter?: string): boolean {
  const tokens = parseMimeTokens(mimeFilter);
  if (tokens.length === 0) return true;
  const normalized = normalizeMimeType(itemMime);
  for (const token of tokens) {
    if (token === "*" || token === "*/*") return true;
    if (token.startsWith(".")) {
      const mapped = MIME[token.slice(1)];
      if (mapped && normalized === mapped) return true;
      continue;
    }
    if (token.endsWith("/")) {
      if (normalized.startsWith(token)) return true;
    } else if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1);
      if (normalized.startsWith(prefix)) return true;
    } else if (normalized === token) {
      return true;
    }
  }
  return false;
}

type CursorMap = Partial<Record<CloudinaryResourceType, string>>;

function encodeMultiCursor(cursors: CursorMap): string | undefined {
  const entries = CLOUDINARY_RESOURCE_TYPES.filter((t) => Boolean(cursors[t]));
  if (entries.length === 0) return undefined;
  const payload: CursorMap = {};
  for (const t of entries) payload[t] = cursors[t];
  const b64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${CURSOR_PREFIX}${b64}`;
}

function decodeCursor(
  cursor: string | undefined,
  types: readonly CloudinaryResourceType[],
): { activeTypes: CloudinaryResourceType[]; cursors: CursorMap; legacySingle: boolean } {
  if (!cursor) {
    return { activeTypes: [...types], cursors: {}, legacySingle: false };
  }
  if (cursor.startsWith(CURSOR_PREFIX)) {
    try {
      const raw = cursor.slice(CURSOR_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
      const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
      const parsed = JSON.parse(atob(padded)) as Record<string, unknown>;
      const cursors: CursorMap = {};
      const activeTypes: CloudinaryResourceType[] = [];
      for (const t of types) {
        const val = parsed?.[t];
        if (typeof val === "string" && val) {
          cursors[t] = val;
          activeTypes.push(t);
        }
      }
      return { activeTypes, cursors, legacySingle: false };
    } catch {
      // Fall through and treat malformed cursor as single-type cursor.
    }
  }
  const singleType = types.length === 1 ? types[0] : "image";
  if (!types.includes(singleType)) {
    return { activeTypes: [], cursors: {}, legacySingle: true };
  }
  return { activeTypes: [singleType], cursors: { [singleType]: cursor }, legacySingle: true };
}

function encodePublicIdPath(publicId: string): string {
  return publicId.split("/").map(encodeURIComponent).join("/");
}

/** Resolve media kind (`image` | `video` | `audio` | `raw`) for `MediaValue` or `(id, mimeType)`. */
function resolveMediaKind(input: {
  id: string;
  mimeType?: string;
  filename?: string;
  meta?: Record<string, unknown>;
}): {
  kind: "image" | "video" | "audio" | "raw";
  resourceType: CloudinaryResourceType;
  publicId: string;
  format?: string;
} {
  const parsed = parseMediaId(input.id);
  const publicId =
    typeof input.meta?.publicId === "string" && input.meta.publicId
      ? input.meta.publicId
      : parsed.publicId;
  const metaFormat =
    typeof input.meta?.format === "string" && input.meta.format ? input.meta.format : undefined;
  const ext =
    (metaFormat || extensionOf(input.filename ?? "") || extensionOf(publicId)).toLowerCase() ||
    undefined;
  const mime = normalizeMimeType(input.mimeType);

  if (
    input.meta?.isAudio === true ||
    mime.startsWith("audio/") ||
    (!mime && ext && isAudioExtension(ext))
  ) {
    return { kind: "audio", resourceType: "video", publicId, format: ext };
  }

  const metaRt = input.meta?.resourceType;
  const explicitRt: CloudinaryResourceType | undefined = parsed.explicit
    ? parsed.resourceType
    : metaRt === "image" || metaRt === "video" || metaRt === "raw"
      ? metaRt
      : undefined;

  if (explicitRt === "raw") {
    return { kind: "raw", resourceType: "raw", publicId, format: ext };
  }
  if (explicitRt === "video" || mime.startsWith("video/")) {
    return { kind: "video", resourceType: "video", publicId, format: ext };
  }
  if (explicitRt === "image" || mime.startsWith("image/")) {
    return { kind: "image", resourceType: "image", publicId, format: ext };
  }
  if (mime) {
    return { kind: "raw", resourceType: "raw", publicId, format: ext };
  }
  if (ext) {
    const mapped = MIME[ext];
    if (!mapped) return { kind: "raw", resourceType: "raw", publicId, format: ext };
    if (mapped.startsWith("video/"))
      return { kind: "video", resourceType: "video", publicId, format: ext };
    if (mapped.startsWith("image/"))
      return { kind: "image", resourceType: "image", publicId, format: ext };
    return { kind: "raw", resourceType: "raw", publicId, format: ext };
  }
  return { kind: "image", resourceType: "image", publicId };
}

/** Testable core: env lookup and fetch are injected. */
export function createCloudinaryProvider(
  config: CloudinaryMediaConfig,
  getEnv: EnvLookup,
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Math.floor(Date.now() / 1000),
): MediaProvider {
  const folder = (config.folder ?? "growgen").replace(/^\/+|\/+$/g, "");
  const maxBytes = config.maxBytes ?? 10 * 1024 * 1024;

  const need = (envVar: string | undefined, def: string): string => {
    const name = envVar || def;
    const v = getEnv(name);
    if (!v)
      throw new Error(
        `Cloudinary: missing ${name}. Set it in environment variables, Worker secrets, or .dev.vars.`,
      );
    return v;
  };
  const creds = (): CloudinaryCredentials => ({
    cloudName: need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME"),
    apiKey: need(config.apiKeyEnvVar, "CLOUDINARY_API_KEY"),
    apiSecret: need(config.apiSecretEnvVar, "CLOUDINARY_API_SECRET"),
  });

  const toItem = (r: CloudinaryResource, cloudName: string): MediaProviderItem => {
    const resourceType = normalizeResourceType(r.resource_type, "image");
    const baseName = r.display_name ?? r.public_id.split("/").pop() ?? r.public_id;
    const fmt = r.format?.toLowerCase();
    const filename =
      fmt && !baseName.toLowerCase().endsWith(`.${fmt}`) ? `${baseName}.${fmt}` : baseName;
    const mimeType = mimeOf(r);
    const isAudio = mimeType.startsWith("audio/") || Boolean(r.is_audio);
    const url = isAudio
      ? deliveryUrl(cloudName, r.public_id, {
          resourceType: "video",
          audio: true,
          format: fmt || extensionOf(filename),
        })
      : deliveryUrl(cloudName, r.public_id, { resourceType });
    const previewUrl =
      resourceType === "image"
        ? deliveryUrl(cloudName, r.public_id, { resourceType: "image", width: 400 })
        : resourceType === "video" && !isAudio
          ? videoPosterUrl(cloudName, r.public_id, { width: 400 })
          : url;

    return {
      id: encodeMediaId(resourceType, r.public_id),
      filename,
      mimeType,
      size: r.bytes,
      width: r.width,
      height: r.height,
      alt: r.context?.custom?.alt,
      previewUrl,
      meta: {
        cloudName,
        publicId: r.public_id,
        resourceType,
        ...(r.format ? { format: r.format } : {}),
        ...(isAudio ? { isAudio: true } : {}),
        url,
      },
    };
  };

  return {
    async list(options: MediaListOptions) {
      const c = creds();
      const types = targetResourceTypes(options.mimeType);
      const { activeTypes, cursors, legacySingle } = decodeCursor(options.cursor, types);
      if (activeTypes.length === 0) return { items: [] };

      const limit = String(options.limit ?? 20);
      const pages = await Promise.all(
        activeTypes.map(async (rt) => {
          const p = new URLSearchParams({
            prefix: `${folder}/`,
            max_results: limit,
            context: "true",
          });
          const cur = cursors[rt];
          if (cur) p.set("next_cursor", cur);
          const res = await fetchImpl(`${apiBase(c.cloudName)}/resources/${rt}/upload?${p}`, {
            headers: { Authorization: basicAuth(c) },
          });
          if (!res.ok) throw new Error(`Cloudinary list failed: ${res.status}`);
          const data = (await res.json()) as {
            resources?: CloudinaryResource[];
            next_cursor?: string;
          };
          return {
            resourceType: rt,
            resources: (data.resources ?? []).map((r) => ({
              ...r,
              resource_type: r.resource_type ?? rt,
            })),
            nextCursor: data.next_cursor,
          };
        }),
      );

      const nextCursors: CursorMap = {};
      const combined: { resource: CloudinaryResource; order: number }[] = [];
      let order = 0;
      for (const page of pages) {
        if (page.nextCursor) nextCursors[page.resourceType] = page.nextCursor;
        for (const resource of page.resources) {
          combined.push({ resource, order: order++ });
        }
      }

      combined.sort((a, b) => {
        const ta = a.resource.created_at ?? "";
        const tb = b.resource.created_at ?? "";
        if (ta !== tb) return tb.localeCompare(ta);
        return a.order - b.order;
      });

      const items = combined
        .map(({ resource }) => toItem(resource, c.cloudName))
        .filter((item) => matchesMimeFilter(item.mimeType, options.mimeType));

      const nextCursor =
        types.length === 1 || legacySingle
          ? nextCursors[activeTypes[0]]
          : encodeMultiCursor(nextCursors);

      return { items, ...(nextCursor ? { nextCursor } : {}) };
    },

    async get(id: string) {
      const c = creds();
      const parsed = parseMediaId(id);
      if (!parsed.publicId) return null;

      const candidates: CloudinaryResourceType[] = parsed.explicit
        ? [parsed.resourceType]
        : [
            parsed.resourceType,
            ...CLOUDINARY_RESOURCE_TYPES.filter((t) => t !== parsed.resourceType),
          ];

      const encodedId = encodePublicIdPath(parsed.publicId);
      for (const rt of candidates) {
        const res = await fetchImpl(
          `${apiBase(c.cloudName)}/resources/${rt}/upload/${encodedId}?context=true`,
          {
            headers: { Authorization: basicAuth(c) },
          },
        );
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`Cloudinary get failed: ${res.status}`);
        const r = (await res.json()) as CloudinaryResource;
        return toItem({ ...r, resource_type: r.resource_type ?? rt }, c.cloudName);
      }
      return null;
    },

    async upload(input: MediaUploadInput) {
      if (input.file.size > maxBytes) throw new Error(`Cloudinary: file exceeds ${maxBytes} bytes`);
      const c = creds();
      const { url, init, resourceType } = await buildUploadRequest(c, {
        file: input.file,
        filename: input.filename,
        folder,
        alt: input.alt,
        timestamp: now(),
      });
      const res = await fetchImpl(url, init);
      if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status} ${await res.text()}`);
      const r = (await res.json()) as CloudinaryResource;
      return toItem({ ...r, resource_type: r.resource_type ?? resourceType }, c.cloudName);
    },

    async delete(id: string) {
      const c = creds();
      const parsed = parseMediaId(id);
      if (!parsed.publicId) return;

      const candidates: CloudinaryResourceType[] = parsed.explicit
        ? [parsed.resourceType]
        : [
            parsed.resourceType,
            ...CLOUDINARY_RESOURCE_TYPES.filter((t) => t !== parsed.resourceType),
          ];

      for (const rt of candidates) {
        const { url, init } = await buildDestroyRequest(c, parsed.publicId, now(), rt);
        const res = await fetchImpl(url, init);
        if (!res.ok && res.status !== 404)
          throw new Error(`Cloudinary delete failed: ${res.status}`);
        if (parsed.explicit) return;
        if (res.status === 404) continue;
        let result: string | undefined;
        try {
          result = ((await res.json()) as { result?: string }).result;
        } catch {
          return;
        }
        if (result !== "not found") return;
      }
    },

    getEmbed(value: MediaValue, options?: EmbedOptions) {
      const cloudName = need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME");
      const resolved = resolveMediaKind({
        id: value.id,
        mimeType: value.mimeType,
        filename: value.filename,
        meta: value.meta,
      });

      if (resolved.kind === "audio") {
        return {
          type: "audio" as const,
          src: deliveryUrl(cloudName, resolved.publicId, {
            resourceType: "video",
            audio: true,
            format: resolved.format,
            quality: options?.quality,
          }),
          controls: true,
          preload: "metadata" as const,
        };
      }

      if (resolved.kind === "video") {
        return {
          type: "video" as const,
          src: deliveryUrl(cloudName, resolved.publicId, {
            resourceType: "video",
            width: options?.width,
            height: options?.height,
            format: options?.format,
            quality: options?.quality,
          }),
          poster: videoPosterUrl(cloudName, resolved.publicId, {
            width: options?.width ?? value.width,
            height: options?.height ?? value.height,
            quality: options?.quality,
          }),
          width: options?.width ?? value.width,
          height: options?.height ?? value.height,
          controls: true,
          playsinline: true,
          preload: "metadata" as const,
        };
      }

      if (resolved.kind === "raw") {
        const rawUrl = deliveryUrl(cloudName, resolved.publicId, { resourceType: "raw" });
        return {
          type: "image" as const,
          src: rawUrl,
          alt: value.alt ?? value.filename,
          cdnBaseUrl: `https://res.cloudinary.com/${cloudName}/raw/upload`,
          getSrc: () => rawUrl,
        };
      }

      const build = (o: {
        width?: number;
        height?: number;
        format?: string;
        quality?: number | string;
      }) => deliveryUrl(cloudName, resolved.publicId, { ...o, resourceType: "image" });
      return {
        type: "image" as const,
        src: build({
          width: options?.width,
          height: options?.height,
          format: options?.format,
          quality: options?.quality,
        }),
        width: value.width,
        height: value.height,
        blurhash: value.blurhash,
        dominantColor: value.dominantColor,
        alt: value.alt,
        cdnBaseUrl: `https://res.cloudinary.com/${cloudName}/image/upload`,
        getSrc: build,
      };
    },

    getThumbnailUrl(id: string, mimeType?: string, options?: { width?: number; height?: number }) {
      const cloudName = need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME");
      const resolved = resolveMediaKind({ id, mimeType });
      if (resolved.kind === "raw") {
        return deliveryUrl(cloudName, resolved.publicId, { resourceType: "raw" });
      }
      if (resolved.kind === "audio") {
        return deliveryUrl(cloudName, resolved.publicId, {
          resourceType: "video",
          audio: true,
          format: resolved.format,
        });
      }
      if (resolved.kind === "video") {
        return videoPosterUrl(cloudName, resolved.publicId, {
          width: options?.width ?? 400,
          height: options?.height,
        });
      }
      return deliveryUrl(cloudName, resolved.publicId, {
        resourceType: "image",
        width: options?.width ?? 400,
        height: options?.height,
      });
    },
  };
}

export type { CreateMediaProviderFn };
