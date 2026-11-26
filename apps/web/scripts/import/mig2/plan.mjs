// MIG-2 step 3: plan the Cloudinary rehost without uploading.
// Reads $MIG2_CACHE/inventory.json and download-index.json. Writes:
//   apps/web/scripts/import/mig2/rewrite-map.json  (ok assets: post -> raw ref -> future delivery URL)
//   apps/web/scripts/import/mig2/dead-links.json   (failed or broken references)
//   apps/web/scripts/import/mig2/upload-plan.json  (one entry per public_id, input for upload.mjs)
//   $MIG2_CACHE/stats.json                         (numbers for the report)
// Usage: node apps/web/scripts/import/mig2/plan.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE, DOCS, PUBLIC_DIR, readJson, sniffImage } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(readFileSync(join(CACHE, "inventory.json"), "utf8"));
const index = readJson(join(CACHE, "download-index.json"), {});
const probe = readJson(join(CACHE, "hotlink-probe.json"), {});

const rewrite = {};
const dead = [];
const plan = new Map();
const perStatus = {};
const perHostStatus = {};
const deadByHost = {};
const bump = (obj, k) => (obj[k] = (obj[k] ?? 0) + 1);

for (const r of inventory.records) {
  if (r.cls === "cloudinary" || r.cls === "data-uri") continue; // leave as-is
  if (r.dup) continue; // counted once with its first occurrence
  const base = { post: r.post, raw: r.raw, kind: r.kind, cls: r.cls };
  if (r.host) base.host = r.host;

  if (r.cls === "broken" || r.cls === "unparseable") {
    dead.push({ ...base, status: r.cls, note: r.note ?? null });
    bump(perStatus, r.cls);
    continue;
  }

  let status;
  let bytes = 0;
  let ext;
  let source;
  let contentType = null;
  let httpStatus = null;
  if (r.cls === "local") {
    const abs = r.localRel.startsWith("public/") ? join(PUBLIC_DIR, r.localRel.slice(7)) : join(DOCS, r.localRel);
    if (!existsSync(abs)) {
      status = "missing";
    } else {
      const buf = readFileSync(abs);
      ext = sniffImage(buf);
      bytes = statSync(abs).size;
      status = ext ? "ok" : "local-not-image";
      source = r.localRel.startsWith("public/") ? `legacy:${r.localRel}` : `legacy:_docs/${r.localRel}`;
      contentType = ext ? `image/${ext === "jpg" ? "jpeg" : ext}` : null;
    }
  } else {
    const d = index[r.url];
    if (!d) status = "not-fetched";
    else {
      status = d.status;
      bytes = d.bytes ?? 0;
      ext = d.ext;
      contentType = d.contentType ?? null;
      httpStatus = d.httpStatus ?? null;
      if (status === "ok") source = `cache:files/${d.file}`;
    }
    bump(perHostStatus, `${r.host} ${status}`);
  }

  bump(perStatus, status);
  if (status !== "ok") {
    dead.push({ ...base, status, httpStatus, contentType, note: status === "local-not-image" ? "file present but not an image" : null });
    if (r.host) bump(deadByHost, r.host);
    continue;
  }
  if (!rewrite[r.post]) rewrite[r.post] = {};
  rewrite[r.post][r.raw] = r.deliveryUrl;
  if (!plan.has(r.publicId)) {
    plan.set(r.publicId, { publicId: r.publicId, post: r.post, originalRef: r.originalRef, source, ext, bytes, contentType });
  }
}

const planList = [...plan.values()].sort((a, b) => a.publicId.localeCompare(b.publicId));
const totalBytes = planList.reduce((s, p) => s + p.bytes, 0);
const uniqueContentBytes = (() => {
  // Bytes if identical files were uploaded once (by content). Cache files are named by URL hash, so
  // recompute from the planned sources.
  const seen = new Map();
  for (const p of planList) {
    const abs = p.source.startsWith("cache:") ? join(CACHE, p.source.slice(6)) : join(DOCS, p.source.replace(/^legacy:_docs\//, "")) ;
    const path = p.source.startsWith("legacy:public/") ? join(PUBLIC_DIR, p.source.slice("legacy:public/".length)) : abs;
    if (!existsSync(path)) continue;
    const h = sha1Of(readFileSync(path));
    if (!seen.has(h)) seen.set(h, p.bytes);
  }
  return [...seen.values()].reduce((s, b) => s + b, 0);
})();

const refsTotal = inventory.records.filter((r) => r.cls !== "cloudinary" && r.cls !== "data-uri" && !r.dup).length;
const okRefs = Object.values(rewrite).reduce((s, m) => s + Object.keys(m).length, 0);

writeFileSync(join(HERE, "rewrite-map.json"), JSON.stringify({
  note: "Original reference (as written in the legacy post) -> future Cloudinary delivery URL. Only ok assets. Cloudinary-hosted and data: references are not listed (left as-is).",
  deliveryBase: "https://res.cloudinary.com/dmq8ipket/image/upload/",
  posts: rewrite,
}, null, 1) + "\n");
writeFileSync(join(HERE, "dead-links.json"), JSON.stringify(dead, null, 1) + "\n");
writeFileSync(join(HERE, "upload-plan.json"), JSON.stringify(planList, null, 1) + "\n");

const stats = {
  postsWithOkRefs: Object.keys(rewrite).length,
  refsConsidered: refsTotal,
  refsOk: okRefs,
  refsDead: dead.length,
  perStatus,
  deadByHost: Object.fromEntries(Object.entries(deadByHost).sort((a, b) => b[1] - a[1])),
  perHostStatus,
  uniqueAssets: planList.length,
  totalBytes,
  uniqueContentBytes,
  hotlinkProbe: probe,
  deadSamples: dead.slice(0, 10),
  estimatedCreditsAddedGB: +(totalBytes / 1e9).toFixed(3),
  estimatedCreditsAddedGBIfDeduped: +(uniqueContentBytes / 1e9).toFixed(3),
};
writeFileSync(join(CACHE, "stats.json"), JSON.stringify(stats, null, 1));
console.log(JSON.stringify({ ...stats, deadSamples: undefined }, null, 1));

function sha1Of(buf) {
  return createHash("sha1").update(buf).digest("hex");
}
