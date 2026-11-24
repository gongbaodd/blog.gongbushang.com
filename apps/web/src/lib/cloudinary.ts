/**
 * Central helper for Cloudinary delivery URLs.
 *
 * Appends `f_auto,q_auto` (auto format + auto quality) after `/image/upload/`
 * (or `/video/upload/`) so every Cloudinary asset is served in the smallest
 * reasonable size. The transform is idempotent and preserves existing
 * transforms (e.g. `a_-90`, `w_800`), versions, folders and query strings.
 *
 * Render boundaries that apply it:
 * - markdown body `<img>` tags: `rehypeCloudinary` in `astro.config.mjs`
 * - post covers: `mapServerPostToClient` in `./post.ts`
 * - gallery images: `readGalleryData` / `applyGalleryEntryToClientPost` in `./gallery.ts`
 * - MDX `DescriptionImage`: `packages/image/DescriptionImage.tsx`
 * - resume showcase: `packages/resume/components/{Work,Job,Education}.tsx`
 *   (`MantineResume.tsx` keeps its own stricter `f_auto,q_50,w_96` params for PDFs)
 */

const CLOUDINARY_UPLOAD_RE =
  /^(https?:\/\/res\.cloudinary\.com\/[^/?#]+\/(?:image|video)\/upload\/)([^?#]*)([?#].*)?$/;

const VERSION_RE = /^v\d+$/;

export const CLOUDINARY_AUTO_TRANSFORM = "f_auto,q_auto";

/** Insert `f_auto,q_auto` into a Cloudinary delivery URL. Non-Cloudinary input passes through unchanged. */
export function optimizeCloudinaryUrl(url: string): string {
  if (typeof url !== "string" || url === "") return url;
  const match = url.match(CLOUDINARY_UPLOAD_RE);
  if (!match) return url;
  const [, prefix, pathPart = "", suffix = ""] = match;
  if (pathPart === "") return url;

  const segments = pathPart.split("/");
  const boundary = segments.findIndex((s) => VERSION_RE.test(s));
  const transformSection = boundary === -1 ? pathPart : segments.slice(0, boundary).join("/");
  const params = transformSection.split(/[/,]/);
  if (params.includes("f_auto") && params.includes("q_auto")) return url;

  return `${prefix}${CLOUDINARY_AUTO_TRANSFORM}/${pathPart}${suffix}`;
}

/**
 * Optimize a cover URL which may be a plain string or an Astro
 * `ImageMetadata` object (`{ src, ... }`). Object identity and extra fields
 * are preserved; non-URL values pass through untouched.
 */
export function optimizeCoverUrl<T>(url: T): T {
  if (typeof url === "string") return optimizeCloudinaryUrl(url) as T;
  if (
    url !== null &&
    typeof url === "object" &&
    "src" in url &&
    typeof (url as { src?: unknown }).src === "string"
  ) {
    const src = (url as { src: string }).src;
    const next = optimizeCloudinaryUrl(src);
    if (next === src) return url;
    return { ...(url as Record<string, unknown>), src: next } as T;
  }
  return url;
}

interface HastNode {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const OPTIMIZABLE_ATTRS: Record<string, string[]> = {
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  video: ["poster"],
};

function rewriteSrcset(srcset: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (trimmed === "") return part;
      const spaceIdx = trimmed.search(/\s/);
      if (spaceIdx === -1) return optimizeCloudinaryUrl(trimmed);
      return `${optimizeCloudinaryUrl(trimmed.slice(0, spaceIdx))}${trimmed.slice(spaceIdx)}`;
    })
    .join(", ");
}

function visitElements(node: unknown): void {
  if (node === null || typeof node !== "object") return;
  const el = node as HastNode;
  if (typeof el.tagName === "string" && el.properties) {
    for (const attr of OPTIMIZABLE_ATTRS[el.tagName] ?? []) {
      const value = el.properties[attr];
      if (typeof value !== "string" || value === "") continue;
      el.properties[attr] = attr === "srcset" ? rewriteSrcset(value) : optimizeCloudinaryUrl(value);
    }
  }
  if (Array.isArray(el.children)) {
    for (const child of el.children) visitElements(child);
  }
}

/**
 * Rehype plugin rewriting Cloudinary `<img>`/`source`/`video` URLs in
 * rendered markdown to `f_auto,q_auto`. Registered in `astro.config.mjs`.
 */
export function rehypeCloudinary() {
  return (tree: unknown): void => {
    visitElements(tree);
  };
}
