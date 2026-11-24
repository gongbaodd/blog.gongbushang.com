// MIG-2 step 1: inventory every image reference in the legacy posts.
// Usage: node apps/web/scripts/import/mig2/inventory.mjs
// Writes $MIG2_CACHE/inventory.json (scratch, outside the repo) and prints a summary.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, classify, extractRefs, listPosts, publicIdFor, deliveryUrl, DOCS, LEGACY_ROOT } from "./lib.mjs";

const posts = await listPosts();
const perClass = {};
const hosts = {};
const broken = [];
const unparseable = [];
const frontmatterKinds = {};
const records = [];
let refCount = 0;

for (const post of posts) {
  const seen = new Set();
  for (const ref of extractRefs(post)) {
    refCount++;
    const c = classify(ref.raw, post);
    // Same post, same resolved reference counts once as an asset.
    const key = c.url ?? c.localRel ?? `${ref.kind}:${ref.raw}`;
    const isDup = seen.has(key);
    seen.add(key);
    const cls = c.cls;
    perClass[cls] = (perClass[cls] ?? 0) + 1;
    if (ref.kind.startsWith("frontmatter")) frontmatterKinds[ref.kind] = (frontmatterKinds[ref.kind] ?? 0) + 1;
    if (cls === "external") hosts[c.host] = (hosts[c.host] ?? 0) + 1;
    const rec = { post: post.rel, kind: ref.kind, raw: ref.raw, cls, dup: isDup };
    if (c.url) rec.url = c.url;
    if (c.host) rec.host = c.host;
    if (c.localRel) rec.localRel = c.localRel;
    if (c.note) rec.note = c.note;
    if (cls === "local") {
      // Original ref for the public_id is the repo-relative path of the resolved file.
      rec.originalRef = c.localRel;
    } else if (cls === "external") {
      rec.originalRef = c.url;
    }
    if (rec.originalRef && !isDup) {
      const publicId = publicIdFor(post, rec.originalRef);
      rec.publicId = publicId;
      rec.deliveryUrl = deliveryUrl(publicId);
    }
    if (cls === "broken") broken.push({ post: post.rel, raw: ref.raw, note: c.note });
    if (cls === "unparseable") unparseable.push({ post: post.rel, raw: ref.raw, note: c.note });
    records.push(rec);
  }
}

// Gallery: not in scope for the 995 posts; counted for the report only.
const galleryJson = readdirSync(join(LEGACY_ROOT, "src/content/_gallery"), { recursive: true }).filter((f) => String(f).endsWith(".json")).length;

mkdirSync(CACHE, { recursive: true });
const out = {
  generatedFrom: DOCS.replace(LEGACY_ROOT, "<legacy>"),
  posts: posts.length,
  postsWithAnyRef: new Set(records.map((r) => r.post)).size,
  refCount,
  perClass,
  externalHosts: Object.fromEntries(Object.entries(hosts).sort((a, b) => b[1] - a[1])),
  frontmatterKinds,
  galleryJsonFiles: galleryJson,
  broken,
  unparseable,
  records,
};
writeFileSync(join(CACHE, "inventory.json"), JSON.stringify(out, null, 1));

const uniqueExternal = new Set(records.filter((r) => r.cls === "external" && r.url).map((r) => r.url));
console.log(JSON.stringify({
  posts: out.posts,
  postsWithAnyRef: out.postsWithAnyRef,
  refCount,
  perClass,
  uniqueExternalUrls: uniqueExternal.size,
  externalHostsTop: Object.entries(out.externalHosts).slice(0, 25),
  frontmatterKinds,
  brokenCount: broken.length,
  unparseableCount: unparseable.length,
  galleryJsonFiles: galleryJson,
  inventoryPath: join(CACHE, "inventory.json"),
}, null, 1));
