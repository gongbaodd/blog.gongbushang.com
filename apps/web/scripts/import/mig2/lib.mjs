// Shared helpers for MIG-2 (image inventory, download, rehost plan).
// Read-only with respect to the legacy checkout. Writes only to the scratch cache
// (outside the repo) and to the JSON maps that the callers name.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { loadSlugger, loadYaml, splitFrontmatter, walk } from "../mig0/lib.mjs";

export const LEGACY_ROOT =
  process.env.LEGACY_ROOT ?? "/Volumes/MacData/github/blog.gongbushang.com";
export const DOCS = join(LEGACY_ROOT, "src/content/_docs");
export const PUBLIC_DIR = join(LEGACY_ROOT, "public");

// Scratch cache for downloads, outside the repo.
export const CACHE = process.env.MIG2_CACHE ?? join(tmpdir(), "mig2-cache");

export const CLOUD = "dmq8ipket";
export const OWN_CLOUD_HOST = "res.cloudinary.com";
export const DELIVERY_BASE = `https://res.cloudinary.com/${CLOUD}/image/upload/`;
export const PUBLIC_ID_ROOT = "growgen/legacy";

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i;
const IMAGE_EXT_ANY = /\.(jpe?g|png|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i;

export const sha1 = (s) => createHash("sha1").update(s).digest("hex");

// Post relative path (under _docs), e.g. "2024/03/30/week-13-3-body-Steroids.md".
export function isPostPath(rel) {
  return /\.mdx?$/i.test(rel);
}

// Lists post files as { rel, abs, dir, stem, slug, y, m, d } using the Astro glob-loader id rule.
export async function listPosts() {
  const slug = await loadSlugger();
  const yaml = loadYaml();
  const out = [];
  for (const rel of walk(DOCS).filter(isPostPath)) {
    const parts = rel.split("/");
    const file = parts[parts.length - 1];
    const stem = file.replace(/\.mdx?$/i, "");
    const [y, m, d] = parts.slice(0, 3);
    const abs = join(DOCS, ...parts);
    const text = readFileSync(abs, "utf8");
    const fm = splitFrontmatter(text, yaml);
    out.push({
      rel,
      abs,
      dir: dirname(abs),
      stem,
      slug: slug(stem),
      date: { y, m, d },
      data: fm ? fm.data : {},
      body: fm ? text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "") : text,
    });
  }
  return out;
}

// Removes code so that image-looking text inside code is not counted.
function stripCode(text) {
  return text
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

const MD_IMAGE = /!\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
const MD_LINK_IMAGE = /(?<!!)\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^)\s]+\.(?:jpe?g|png|gif|webp|svg|avif|bmp)(?:[?#][^)\s]*)?)\s*(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\)/gi;
const HTML_IMG = /<img\b[^>]*>/gi;
const SRC_ATTR = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s>]+))/i;

// Returns raw references found in a post body and frontmatter.
export function extractRefs(post) {
  const refs = [];
  const body = stripCode(post.body);
  for (const m of body.matchAll(MD_IMAGE)) {
    refs.push({ kind: "md-image", raw: m[2] });
  }
  for (const m of body.matchAll(MD_LINK_IMAGE)) {
    refs.push({ kind: "md-link-image", raw: m[1] });
  }
  for (const m of body.matchAll(HTML_IMG)) {
    const s = m[0].match(SRC_ATTR);
    if (!s) refs.push({ kind: "html-img", raw: null, note: "img without src" });
    else refs.push({ kind: "html-img", raw: s[1] ?? s[2] ?? s[3] ?? s[4] ?? "" });
  }
  // Frontmatter: cover.url (or cover string) and any other string value that names an image.
  const walkFm = (val, path) => {
    if (typeof val === "string") {
      if (path === "cover.url" || path === "cover" || IMAGE_EXT_ANY.test(val)) {
        refs.push({ kind: `frontmatter:${path}`, raw: val });
      }
    } else if (val && typeof val === "object") {
      for (const [k, v] of Object.entries(val)) walkFm(v, path ? `${path}.${k}` : k);
    }
  };
  walkFm(post.data, "");
  return refs;
}

// Normalises the raw value: trims, unwraps <...>, decodes HTML entities.
export function cleanRef(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1).trim();
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

const HOST_OK = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

// Classifies one reference. Returns { cls, url?, host?, localRel?, localAbs?, note? }.
export function classify(rawIn, post) {
  const raw = cleanRef(rawIn);
  if (raw === null) return { cls: "unparseable", note: "missing src" };
  if (raw === "") return { cls: "unparseable", note: "empty" };
  if (/^data:/i.test(raw)) return { cls: "data-uri" };
  if (/[{}\n\r\t]|\$\{|\{\{/.test(raw)) return { cls: "unparseable", note: "template or expression" };
  if (/^(https?:)?\/\//i.test(raw)) {
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    let u;
    try {
      u = new URL(normalized);
    } catch {
      return { cls: "unparseable", note: "invalid URL" };
    }
    if (!HOST_OK.test(u.hostname)) return { cls: "unparseable", note: "bad host" };
    if (u.hostname === OWN_CLOUD_HOST && u.pathname.startsWith(`/${CLOUD}/`)) {
      return { cls: "cloudinary", url: normalized, host: u.hostname };
    }
    return { cls: "external", url: normalized, host: u.hostname.toLowerCase() };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return { cls: "unparseable", note: `scheme ${raw.split(":")[0]}` };
  }
  // Local: relative to the post, or site-absolute (resolved against legacy public/).
  let p = raw.split(/[?#]/)[0];
  let decoded;
  try {
    decoded = decodeURI(p);
  } catch {
    return { cls: "unparseable", note: "bad percent-encoding" };
  }
  if (p.startsWith("/")) {
    const abs = join(PUBLIC_DIR, decoded);
    if (existsSync(abs) && statSync(abs).isFile()) {
      return { cls: "local", localAbs: abs, localRel: posix.join("public", decoded), via: "public" };
    }
    return { cls: "broken", note: "site-absolute path not in public/", raw };
  }
  const abs = resolve(post.dir, decoded);
  if (existsSync(abs) && statSync(abs).isFile()) {
    const rel = relative(DOCS, abs).split(sep).join("/");
    if (rel.startsWith("..")) return { cls: "broken", note: "outside _docs", raw };
    return { cls: "local", localAbs: abs, localRel: rel, via: "post-dir" };
  }
  return { cls: "broken", note: "file not found", raw };
}

// Deterministic public_id. The hash input is the original reference (the URL as written, or the
// repo-relative path for local files), so re-running produces the same id.
export function publicIdFor(post, originalRef) {
  const { y, m, d } = post.date;
  return `${PUBLIC_ID_ROOT}/${y}/${m}/${d}/${post.slug}/${sha1(originalRef).slice(0, 12)}`;
}

export function deliveryUrl(publicId) {
  return `${DELIVERY_BASE}${publicId}`;
}

// Magic-byte sniff so cache files get the right extension and bad hotlink pages are caught.
export function sniffImage(buf) {
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buf.slice(0, 4).toString("ascii") === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.slice(0, 2).toString("ascii") === "BM") return "bmp";
  if (buf.slice(4, 12).toString("ascii") === "ftypavif") return "avif";
  const head = buf.slice(0, 512).toString("utf8").trimStart();
  if (/^(<\?xml[\s\S]*?)?<svg\b/i.test(head)) return "svg";
  return null;
}

export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} kB`);

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export { basename };
