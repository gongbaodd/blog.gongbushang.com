// MIG-2 step 4: upload planned assets to Cloudinary. PREPARED, NOT RUN in phase 1.
//
// Dry run is the default: it prints the exact cld commands and makes no cloud calls.
// Real uploads need --execute. Each asset is checked with `cld admin resource` first and
// skipped when it already exists, so re-runs are idempotent.
//
// Usage:
//   node apps/web/scripts/import/mig2/upload.mjs                    (dry run, prints plan)
//   node apps/web/scripts/import/mig2/upload.mjs --limit 5          (dry run, first 5)
//   node apps/web/scripts/import/mig2/upload.mjs --execute --batch 50 --sleep-ms 400
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CACHE, DOCS, PUBLIC_DIR, readJson } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const argOf = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : def;
};
const DRY_RUN = flag("--dry-run") || !flag("--execute");
const LIMIT = Number(argOf("--limit", "0")) || Infinity;
const BATCH = Number(argOf("--batch", "50"));
const SLEEP_MS = Number(argOf("--sleep-ms", "400"));
const CLD = process.env.CLD_BIN ?? join(homedir(), ".local/bin/cld");

const plan = JSON.parse(readFileSync(new URL("./upload-plan.json", import.meta.url), "utf8"));
const index = readJson(join(CACHE, "upload-index.json"), {});
const LOG = join(CACHE, "upload.log");
mkdirSync(CACHE, { recursive: true });

const log = (line) => writeFileSync(LOG, `${new Date().toISOString()} ${line}\n`, { flag: "a" });

// Maps a plan entry to the local file to upload.
function sourcePath(p) {
  if (p.source.startsWith("cache:")) return join(CACHE, p.source.slice("cache:".length));
  if (p.source.startsWith("legacy:public/")) return join(PUBLIC_DIR, p.source.slice("legacy:public/".length));
  if (p.source.startsWith("legacy:_docs/")) return join(DOCS, p.source.slice("legacy:_docs/".length));
  throw new Error(`unknown source ${p.source}`);
}

function cld(argv) {
  const r = spawnSync(CLD, argv, { encoding: "utf8", timeout: 120000 });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// `cld admin resource <public_id>` exits 0 and returns JSON when the asset exists.
function exists(publicId) {
  const r = cld(["admin", "resource", publicId]);
  if (r.code === 0 && /"public_id"/.test(r.out)) return true;
  if (/not found|404/i.test(r.out)) return false;
  throw new Error(`admin lookup failed for ${publicId}: ${r.out.slice(0, 200)}`);
}

const queue = plan.filter((p) => index[p.publicId]?.status !== "uploaded" && index[p.publicId]?.status !== "exists").slice(0, LIMIT);
const counts = { planned: plan.length, queued: queue.length, uploaded: 0, exists: 0, failed: 0, missingSource: 0 };

if (DRY_RUN) {
  for (const p of queue.slice(0, 20)) {
    const src = sourcePath(p);
    console.log(`[dry-run] check: ${CLD} admin resource ${p.publicId}`);
    console.log(`[dry-run] upload: ${CLD} uploader upload <${p.source}> public_id=${p.publicId} overwrite=false resource_type=image`);
    if (!existsSync(src)) counts.missingSource++;
  }
  console.log(JSON.stringify({ mode: "dry-run", ...counts, note: "no cld calls were made; pass --execute to upload" }, null, 1));
  process.exit(0);
}

let n = 0;
for (const p of queue) {
  const src = sourcePath(p);
  if (!existsSync(src)) {
    index[p.publicId] = { status: "missing-source", source: p.source };
    counts.missingSource++;
    continue;
  }
  try {
    if (exists(p.publicId)) {
      index[p.publicId] = { status: "exists" };
      counts.exists++;
    } else {
      const r = cld(["uploader", "upload", src, `public_id=${p.publicId}`, "overwrite=false", "resource_type=image"]);
      if (r.code === 0) {
        index[p.publicId] = { status: "uploaded", bytes: p.bytes };
        counts.uploaded++;
      } else {
        index[p.publicId] = { status: "failed", error: r.out.slice(0, 300) };
        counts.failed++;
        log(`failed ${p.publicId}: ${r.out.slice(0, 200)}`);
      }
    }
  } catch (e) {
    index[p.publicId] = { status: "failed", error: String(e.message).slice(0, 300) };
    counts.failed++;
  }
  n++;
  if (n % BATCH === 0) {
    writeFileSync(join(CACHE, "upload-index.json"), JSON.stringify(index, null, 1));
    log(`progress ${n}/${queue.length} ${JSON.stringify(counts)}`);
  }
  await new Promise((r) => setTimeout(r, SLEEP_MS));
}
writeFileSync(join(CACHE, "upload-index.json"), JSON.stringify(index, null, 1));
log(`done ${JSON.stringify(counts)}`);
console.log(JSON.stringify({ mode: "execute", ...counts }, null, 1));
