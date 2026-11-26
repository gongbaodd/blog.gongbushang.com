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

// ---------------------------------------------------------------------------------------------
// CLI guards (MIG-7 review fixes): explicit --rewrite, production target guard, --bump preconditions.
// ---------------------------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Parse the EmDash admin URL the catch-up writes to.
 * Returns `{ ok, host, loopback, error? }`. Userinfo and non-http(s) schemes are rejected.
 * Loopback means `localhost`, `127.0.0.1` or `[::1]` only; any other host is treated as remote (production).
 */
export function describeTarget(url) {
  if (!url) return { ok: false, host: "", loopback: false, error: "no admin URL" };
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, host: "", loopback: false, error: `invalid admin URL ${JSON.stringify(url)}` };
  }
  if (!/^https?:$/.test(u.protocol)) {
    return { ok: false, host: u.host, loopback: false, error: `admin URL must be http(s) (got ${u.protocol})` };
  }
  if (u.username || u.password) {
    return { ok: false, host: u.host, loopback: false, error: "admin URL must not contain userinfo (user:password@host)" };
  }
  return { ok: true, host: u.host, loopback: LOOPBACK_HOSTS.has(u.hostname.toLowerCase()) };
}

/**
 * Validate the CLI options. Returns a list of error strings (empty = ok).
 *   - `--rewrite` must be `map` or `none`; with `--write` it is REQUIRED (no silent default).
 *   - `--write` needs a valid admin URL, and a non-loopback one needs `--yes-production`.
 *   - `--bump` needs `--write`.
 */
export function validateOptions({ write, rewrite, url, yesProduction = false, bump = false }) {
  const errors = [];
  if (rewrite !== undefined && !["map", "none"].includes(rewrite)) {
    errors.push(`--rewrite must be map or none (got ${rewrite})`);
  }
  if (bump && !write) errors.push("--bump needs --write (it only runs after a successful import)");
  if (!write) return errors;
  if (rewrite === undefined) {
    errors.push(
      "--write needs an explicit --rewrite <map|none> (map: MIG-2 hosted body images become Cloudinary URLs; none: body keeps the legacy URLs). See MIG-7.md: local uses none, production map after the read-only count check",
    );
  }
  const t = describeTarget(url);
  if (!t.ok) errors.push(`--write needs --url <emdash admin url> (or EMDASH_URL): ${t.error}`);
  else if (!t.loopback && !yesProduction) {
    errors.push(`refusing to write to non-loopback admin ${t.host} without --yes-production`);
  }
  return errors;
}

/**
 * `--bump` preconditions: the gitlink in HEAD and the submodule checkout must both sit at `base`
 * (or both already at `target`, which makes the bump a no-op), and the submodule worktree must be clean.
 * Returns `{ errors, noop }`.
 */
export function bumpPreconditions({ headGitlink, subHead, subDirty = false, base, target }) {
  const errors = [];
  const short = (s) => String(s ?? "").slice(0, 8);
  if (headGitlink === target && subHead === target && !subDirty) return { errors, noop: true };
  if (headGitlink !== base) {
    errors.push(`HEAD:src/content is ${short(headGitlink)}, not --base ${short(base)}; the gitlink would not move base -> target`);
  }
  if (subHead !== base) errors.push(`src/content is checked out at ${short(subHead)}, not --base ${short(base)}`);
  if (subDirty) errors.push("src/content has uncommitted changes");
  return { errors, noop: false };
}

export { imageRefs, isCloudinary };
