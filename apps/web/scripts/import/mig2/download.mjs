// MIG-2 step 2: download external images into the scratch cache (outside the repo).
// Local only: nothing is uploaded to Cloudinary. Safe to re-run; ok entries are skipped.
// Usage: node apps/web/scripts/import/mig2/download.mjs [--limit N] [--concurrency 4]
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE, readJson, sha1, sniffImage } from "./lib.mjs";

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const LIMIT = Number(argOf("--limit", "0")) || Infinity;
const CONCURRENCY = Math.min(4, Number(argOf("--concurrency", "4")));
const TIMEOUT_MS = 20000;
const MAX_BYTES = 30 * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Referer per host family: the site that serves the images, so hotlink checks see a same-site request.
const REFERER_BY_SUFFIX = [
  ["doubanio.com", "https://movie.douban.com/"],
  ["douban.com", "https://www.douban.com/"],
  ["sinaimg.cn", "https://blog.sina.com.cn/"],
  ["hdslb.com", "https://www.bilibili.com/"],
  ["bdimg.com", "https://www.baidu.com/"],
];
export function refererFor(url) {
  const u = new URL(url);
  for (const [suffix, ref] of REFERER_BY_SUFFIX) {
    if (u.hostname === suffix || u.hostname.endsWith(`.${suffix}`)) return ref;
  }
  return `${u.origin}/`;
}

const FILES = join(CACHE, "files");
const INDEX = join(CACHE, "download-index.json");
const LOG = join(CACHE, "download.log");
mkdirSync(FILES, { recursive: true });

const inventory = JSON.parse(readFileSync(join(CACHE, "inventory.json"), "utf8"));
const urls = [...new Set(inventory.records.filter((r) => r.cls === "external" && r.url).map((r) => r.url))];
const index = readJson(INDEX, {});

const save = () => writeFileSync(INDEX, JSON.stringify(index, null, 1));
const log = (line) => {
  const s = `${new Date().toISOString()} ${line}\n`;
  writeFileSync(LOG, s, { flag: "a" });
};

async function attempt(url, withReferer = true) {
  const headers = { "User-Agent": UA, Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" };
  if (withReferer) headers.Referer = refererFor(url);
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (!res.ok) {
    await res.body?.cancel();
    return { status: res.status === 404 || res.status === 410 ? "404" : res.status === 403 ? "403" : `http-${res.status}`, httpStatus: res.status, contentType };
  }
  if (declared > MAX_BYTES) {
    await res.body?.cancel();
    return { status: "too-large", httpStatus: res.status, contentType, bytes: declared };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return { status: "too-large", httpStatus: res.status, contentType, bytes: buf.length };
  const sniffed = sniffImage(buf);
  if (!sniffed) {
    // Typically an HTML placeholder or a login page served to hotlinkers.
    return { status: contentType.startsWith("text/html") ? "html-not-image" : "not-image", httpStatus: res.status, contentType, bytes: buf.length };
  }
  return { status: "ok", httpStatus: res.status, contentType, bytes: buf.length, ext: sniffed, buf };
}

async function fetchOne(url) {
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      last = await attempt(url);
      if (last.status === "ok" || last.status === "404" || last.status === "403") break;
    } catch (e) {
      last = { status: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network-error", error: String(e?.cause?.code ?? e?.message ?? e).slice(0, 120) };
    }
    if (i === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  const { buf, ...meta } = last;
  const rec = { ...meta, host: new URL(url).hostname, referer: refererFor(url), checkedAt: new Date().toISOString() };
  if (buf) {
    const name = `${sha1(url)}.${meta.ext}`;
    const tmp = join(FILES, `${name}.part`);
    writeFileSync(tmp, buf);
    renameSync(tmp, join(FILES, name));
    rec.file = name;
  }
  return rec;
}

const todo = urls.filter((u) => !(index[u]?.status === "ok" && existsSync(join(FILES, index[u].file)))).slice(0, LIMIT);
log(`start: ${urls.length} unique external URLs, ${todo.length} to fetch, concurrency ${CONCURRENCY}`);
let done = 0;
let next = 0;
async function worker() {
  while (next < todo.length) {
    const url = todo[next++];
    index[url] = await fetchOne(url);
    done++;
    if (done % 25 === 0) {
      save();
      log(`progress ${done}/${todo.length}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();

// Hotlink probe: one URL per top host, fetched without a Referer, to see whether the host gates on it.
const hostCounts = {};
for (const u of urls) {
  const h = new URL(u).hostname;
  hostCounts[h] = (hostCounts[h] ?? 0) + 1;
}
const topHosts = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([h]) => h);
const probe = {};
for (const host of topHosts) {
  const sample = urls.find((u) => new URL(u).hostname === host);
  try {
    const r = await attempt(sample, false);
    probe[host] = { sampleUrlStatus: r.status, httpStatus: r.httpStatus ?? null, withReferer: index[sample]?.status ?? "not-fetched" };
  } catch (e) {
    probe[host] = { sampleUrlStatus: e?.name === "TimeoutError" ? "timeout" : "network-error", withReferer: index[sample]?.status ?? "not-fetched" };
  }
}
writeFileSync(join(CACHE, "hotlink-probe.json"), JSON.stringify(probe, null, 1));
save();

const tally = {};
for (const u of urls) tally[index[u]?.status ?? "not-fetched"] = (tally[index[u]?.status ?? "not-fetched"] ?? 0) + 1;
log(`done: ${JSON.stringify(tally)}`);
console.log(JSON.stringify({ uniqueExternal: urls.length, fetchedThisRun: done, tally, indexPath: INDEX, logPath: LOG }, null, 1));
