/**
 * MIG-7 catch-up helpers: fixes four gaps discovered in MIG-6 when syncing master
 * commit 6108d10 (src/content 697380543):
 *   1. Diffs both `_docs` (*.md/mdx) and `_gallery` (*.json).
 *   2. Derives post legacy_id with Astro's github-slugger segment rules (`globLegacyId`),
 *      matching `mig1/import.mjs` even for mixed-case / punctuated filenames.
 *   3. Image guard recognizes URLs already rehosted to Cloudinary in MIG-2
 *      (`mig2/rewrite-map.json` + `mig2/upload-result.json`).
 *   4. Validates added/modified gallery JSON image URLs are on `res.cloudinary.com`.
 */
import { imageRefs, isCloudinary } from "../mig6/lib.mjs";

const POST_RE = /^_docs\/(.+\.mdx?)$/i;
const GALLERY_RE = /^_gallery\/(.+\.json)$/i;

export const DEFAULT_DELIVERY_BASE = "https://res.cloudinary.com/dmq8ipket/image/upload/";

function pushBucket(bucket, code, a, b, re) {
  if (code === "R" || code === "C") {
    const to = re.exec(b ?? "")?.[1];
    const from = re.exec(a ?? "")?.[1];
    if (code === "R") {
      if (to && from) bucket.renamed.push({ status: "renamed", path: to, from });
      else if (to) bucket.added.push({ status: "added", path: to });
      else if (from) bucket.deleted.push({ status: "deleted", path: from });
    } else if (to) {
      bucket.added.push({ status: "added", path: to });
    }
    return;
  }
  const p = re.exec(a ?? "")?.[1];
  if (!p) return;
  if (code === "A") bucket.added.push({ status: "added", path: p });
  else if (code === "M" || code === "T") bucket.modified.push({ status: "modified", path: p });
  else if (code === "D") bucket.deleted.push({ status: "deleted", path: p });
}

/**
 * Parse `git -c core.quotepath=false diff --name-status -M <base> <target> -- _docs _gallery`
 * into classified `posts` and `gallery` buckets.
 */
export function parseContentDiff(out) {
  const posts = { added: [], modified: [], deleted: [], renamed: [] };
  const gallery = { added: [], modified: [], deleted: [], renamed: [] };

  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [st, a, b] = line.split("\t");
    if (!st) continue;
    const code = st[0];
    pushBucket(posts, code, a, b, POST_RE);
    pushBucket(gallery, code, a, b, GALLERY_RE);
  }

  for (const group of [posts, gallery]) {
    for (const k of Object.keys(group)) {
      group[k].sort((x, y) => x.path.localeCompare(y.path));
    }
  }

  return { posts, gallery };
}

/** Posts that must be imported: added, modified, and the new side of renames. */
export function importablePosts(posts) {
  return [...posts.added, ...posts.modified, ...posts.renamed].map((r) => r.path);
}

/** Gallery items that must be imported: added, modified, and the new side of renames. */
export function importableGallery(gallery) {
  return [...gallery.added, ...gallery.modified, ...gallery.renamed].map((r) => r.path);
}

/**
 * Pure-JS segment slugger matching `github-slugger@2.0.0` (`slug(seg)`):
 * lowercases, strips Unicode Other/Punctuation/Symbol characters except `-` and `_`,
 * and converts spaces to `-`.
 */
export function slugifySegment(seg) {
  return String(seg)
    .toLowerCase()
    .replace(/[\p{Other}\p{Punctuation}\p{Symbol}]/gu, (ch) => (ch === "-" || ch === "_" ? ch : ""))
    .replace(/ /g, "-");
}

/**
 * Astro glob-loader legacy_id for a post path relative to `_docs/`:
 * drops extension, slugs each path segment, strips trailing `/index`.
 * Mirrors `globId()` in `mig0/lib.mjs` / `mig1/import.mjs`.
 */
export function globLegacyId(relPath, slugFn = slugifySegment) {
  const noExt = relPath.replace(/\.[^./]+$/, "");
  return noExt
    .split("/")
    .map((seg) => slugFn(seg))
    .join("/")
    .replace(/\/index$/, "");
}

/** Legacy id for a gallery path relative to `_gallery/` (e.g. `11/25/beijing.json` -> `11/25/beijing`). */
export function galleryLegacyId(relPath) {
  return relPath.replace(/\.json$/i, "");
}

/** EmDash slug for a gallery legacy_id (mirrors `mig3/import.mjs`: `/` -> `-`). */
export function gallerySlug(legacyId) {
  return legacyId.replaceAll("/", "-");
}

/** Extract set of Cloudinary public_ids confirmed uploaded/existing from MIG-2 `upload-result.json`. */
export function uploadedPublicIds(uploadResult) {
  if (!uploadResult || typeof uploadResult !== "object") return new Set();
  return new Set(
    Object.entries(uploadResult)
      .filter(([, v]) => ["uploaded", "exists"].includes(v?.status))
      .map(([id]) => id),
  );
}

/**
 * MIG-2-aware post image guard.
 * Accepts any image URL that is either:
 *   1. Already on `res.cloudinary.com`, or
 *   2. Present in `rewriteMap.posts[path][url]` AND confirmed uploaded/exists in `uploadResult`.
 *
 * Returns `{ unhosted, rewrittenByMap, cloudinaryDirect }`.
 */
export function checkPostImages(
  files,
  { rewriteMap = null, uploadResult = null, deliveryBase = DEFAULT_DELIVERY_BASE } = {},
) {
  const uploaded = uploadedPublicIds(uploadResult);
  const unhosted = [];
  const rewrittenByMap = [];
  let cloudinaryDirect = 0;

  for (const f of files) {
    const postMap = rewriteMap?.posts?.[f.path] ?? null;
    for (const url of imageRefs(f.text)) {
      if (isCloudinary(url)) {
        cloudinaryDirect++;
        continue;
      }
      const mapped = postMap?.[url];
      if (mapped && mapped.startsWith(deliveryBase)) {
        const publicId = mapped.slice(deliveryBase.length);
        if (uploaded.has(publicId)) {
          rewrittenByMap.push({ path: f.path, url, cloudinaryUrl: mapped, publicId });
          continue;
        }
        unhosted.push({ path: f.path, url, reason: "mapped-but-not-uploaded", publicId });
        continue;
      }
      unhosted.push({ path: f.path, url, reason: "not-on-cloudinary" });
    }
  }

  return { unhosted, rewrittenByMap, cloudinaryDirect };
}

/**
 * Gallery image guard: ensures every added/modified gallery JSON has an `image`
 * URL hosted on `res.cloudinary.com`.
 */
export function checkGalleryImages(items) {
  const unhosted = [];
  for (const item of items) {
    const url = item?.data?.image;
    if (typeof url !== "string" || !isCloudinary(url)) {
      unhosted.push({ path: item.path, url: typeof url === "string" ? url : "(missing)" });
    }
  }
  return unhosted;
}

export { imageRefs, isCloudinary };
