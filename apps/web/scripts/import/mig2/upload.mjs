// MIG-2 step 4: upload planned assets to Cloudinary (cloud dmq8ipket, folder growgen/legacy/).
//
// Dry run is the default: it prints the exact cld commands and makes no cloud calls.
// Real uploads need --execute. Each asset is checked with `cld admin resource` first and
// skipped when it already exists (idempotent). overwrite=false is always sent.
// Concurrency is capped at 3. Each failed upload is retried once.
// Results go to $TMPDIR/mig2-cache/upload-index.json (scratch) and to the committed
// mig2/upload-result.json (public_id -> status).
//
// Usage:
//   node apps/web/scripts/import/mig2/upload.mjs                          (dry run, prints plan)
//   node apps/web/scripts/import/mig2/upload.mjs --execute --limit 5      (first 5 only)
//   node apps/web/scripts/import/mig2/upload.mjs --execute --concurrency 3 (the rest)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE, DOCS, PUBLIC_DIR, readJson } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const argOf = (n, def) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : def;
};
const DRY_RUN = flag("--dry-run") || !flag("--execute");
const LIMIT = Number(argOf("--limit", "0")) || Infinity;
const CONCURRENCY = Math.min(3, Math.max(1, Number(argOf("--concurrency", "3"))));
const CLD = process.env.CLD_BIN ?? join(homedir(), ".local/bin/cld");

const plan = JSON.parse(readFileSync(join(HERE, "upload-plan.json"), "utf8"));
const INDEX = join(CACHE, "upload-index.json");
const index = readJson(INDEX, {});
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
  const r = spawnSync(CLD, argv, { encoding: "utf8", timeout: 180000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  return { code: r.status, out, ok: r.status === 0 && !/^error:/m.test(out) };
}

// `cld admin resource <public_id>` succeeds with JSON when the asset exists; 404 when it does not.
function exists(publicId) {
  const r = cld(["admin", "resource", publicId]);
  if (r.ok && /"public_id"/.test(r.out)) return true;
  if (/404|not found/i.test(r.out)) return false;
  throw new Error(`admin lookup failed for ${publicId}: ${r.out.slice(0, 200)}`);
}

function uploadOnce(p, src) {
  // The Admin API (exists check) has an hourly rate limit on the Free plan (error 420). Uploads use the
  // Upload API and overwrite=false already makes them idempotent, so on 420 skip the check and upload.
  let already = false;
  try {
    already = exists(p.publicId);
  } catch (e) {
    if (!/Error 420|Rate Limit/i.test(String(e.message))) throw e;
  }
  if (already) return { status: "exists" };
  const r = cld(["uploader", "upload", src, `public_id=${p.publicId}`, "overwrite=false", "resource_type=image"]);
  if (r.ok) return { status: "uploaded" };
  return { status: "failed", error: r.out.slice(0, 300) };
}

const pending = plan.filter((p) => !["uploaded", "exists"].includes(index[p.publicId]?.status));
const queue = pending.slice(0, LIMIT);
const counts = { planned: plan.length, alreadyDone: plan.length - pending.length, queued: queue.length, uploaded: 0, exists: 0, failed: 0, missingSource: 0 };

if (DRY_RUN) {
  for (const p of queue.slice(0, 20)) {
    console.log(`[dry-run] check: ${CLD} admin resource ${p.publicId}`);
    console.log(`[dry-run] upload: ${CLD} uploader upload <${p.source}> public_id=${p.publicId} overwrite=false resource_type=image`);
  }
  console.log(JSON.stringify({ mode: "dry-run", ...counts, note: "no cld calls were made; pass --execute to upload" }, null, 1));
  process.exit(0);
}

let done = 0;
let next = 0;
async function worker() {
  while (next < queue.length) {
    const p = queue[next++];
    const src = sourcePath(p);
    if (!existsSync(src)) {
      index[p.publicId] = { status: "missing-source", source: p.source };
      counts.missingSource++;
    } else {
      let res;
      try {
        res = uploadOnce(p, src);
        if (res.status === "failed") {
          log(`retry ${p.publicId}: ${res.error.slice(0, 160)}`);
          await new Promise((r) => setTimeout(r, 2000));
          res = uploadOnce(p, src);
        }
      } catch (e) {
        res = { status: "failed", error: String(e.message).slice(0, 300) };
      }
      index[p.publicId] = { ...res, bytes: p.bytes };
      counts[res.status === "uploaded" ? "uploaded" : res.status === "exists" ? "exists" : "failed"]++;
      if (res.status === "failed") log(`failed ${p.publicId}: ${res.error.slice(0, 200)}`);
    }
    done++;
    if (done % 25 === 0) {
      writeFileSync(INDEX, JSON.stringify(index, null, 1));
      log(`progress ${done}/${queue.length} ${JSON.stringify(counts)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
writeFileSync(INDEX, JSON.stringify(index, null, 1));
log(`done ${JSON.stringify(counts)}`);
console.log(JSON.stringify({ mode: "execute", ...counts }, null, 1));
