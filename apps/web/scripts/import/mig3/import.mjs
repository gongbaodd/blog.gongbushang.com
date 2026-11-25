#!/usr/bin/env node
/**
 * MIG-3: import the 150 podcast episodes and 75 gallery items from the legacy content submodule into EmDash.
 *
 *   node apps/web/scripts/import/mig3/import.mjs --url http://127.0.0.1:4322 [--only podcast|gallery]
 *        [--dry-run] [--update] [--source <src/content dir>]
 *
 * Idempotent upsert keyed on `legacy_id` (episode id / gallery `MM/DD/name`). A re-run creates what is missing
 * and leaves everything else alone; entries whose stored fields differ from the legacy files are only reported
 * ("differs") unless --update is given, so edits made in the admin are never overwritten by accident.
 *
 * Legacy sources (read only):
 *   generated/podcast/<id>.json   one file per episode (fetch-podcast output; `embeddings` are NOT imported: derived data)
 *   _gallery/MM/DD/<name>.json    { image, doc }  (source of truth for image and doc)
 *   generated/gallery.json        hash, addedAt, colorSet per image (prepare-gallery output)
 * Trace SVGs and embeddings are derived at build time (scripts/derive), not stored in the CMS.
 *
 * Images: every gallery image is already a Cloudinary URL and every podcast cover/audio is a third-party URL
 * (Spotify/anchor CDN); nothing is uploaded. If a gallery image is not on res.cloudinary.com the run stops and
 * prints the list, because uploads need the owner's OK.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, isoOrNull, upsert } from "./rest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (name, dflt) => {
  const eq = args.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("-") ? args[i + 1] : dflt;
};

const SOURCE = resolve(opt("--source", process.env.LEGACY_CONTENT_DIR ?? join(HERE, "../../../../../src/content")));
const ONLY = opt("--only", "all");
const DRY = flag("--dry-run");
const UPDATE = flag("--update");
const client = createClient({ url: opt("--url", process.env.EMDASH_URL ?? "http://127.0.0.1:4322"), token: opt("--token") });
const OUT = join(tmpdir(), "mig3");
mkdirSync(OUT, { recursive: true });
const tag = `${new URL(client.base).host.replace(/[^a-z0-9]+/gi, "-")}${DRY ? "-dry" : ""}`;
const LOG = join(OUT, `${tag}.log`);
const say = (m) => {
  console.log(m);
  appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
};

if (!["all", "podcast", "gallery"].includes(ONLY)) {
  console.error("--only must be podcast or gallery");
  process.exit(2);
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** Same rule as the CMS-1 schema: slug = legacy id with "/" -> "-". */
const gallerySlug = (id) => id.replaceAll("/", "-");

// ---------------------------------------------------------------------------------------------------------------
function loadPodcast() {
  const dir = join(SOURCE, "generated/podcast");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .sort()
    .map((f) => {
      const e = readJson(join(dir, f));
      const pub = isoOrNull(e.pubDate);
      if (!pub || new Date(pub).toUTCString() !== e.pubDate) throw new Error(`${e.id}: pubDate "${e.pubDate}" does not round-trip through ISO`);
      return {
        slug: e.id,
        data: {
          title: e.title,
          legacy_id: e.id,
          link: e.link || null,
          pub_date: pub,
          description: e.description ?? "",
          summary: e.summary ?? "",
          duration: e.duration ?? "",
          audio_url: e.audioUrl || null,
          image_url: e.image || null,
          color_set: e.colorSet ?? null,
        },
      };
    });
}

function loadGallery() {
  const meta = new Map(readJson(join(SOURCE, "generated/gallery.json")).images.map((i) => [i.id, i]));
  const root = join(SOURCE, "_gallery");
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".json")) files.push(join(d, e.name));
    }
  };
  walk(root);
  const items = files.sort().map((f) => {
    const id = f.slice(root.length + 1).replace(/\.json$/, "");
    const raw = readFileSync(f, "utf8");
    const src = JSON.parse(raw);
    const m = meta.get(id);
    if (!m) throw new Error(`${id}: in _gallery but not in generated/gallery.json (run pnpm gallery:prepare in the legacy repo)`);
    if (m.hash !== sha256(raw)) throw new Error(`${id}: generated/gallery.json is stale (hash differs from the source file)`);
    return {
      slug: gallerySlug(id),
      data: {
        title: id.split("/").pop(),
        legacy_id: id,
        file: m.file ?? id,
        hash: m.hash,
        image_url: src.image,
        doc: src.doc,
        added_at: isoOrNull(m.addedAt),
        color_set: m.colorSet ?? null,
      },
    };
  });
  const offCloudinary = items.filter((i) => !/^https:\/\/res\.cloudinary\.com\//.test(i.data.image_url)).map((i) => `${i.data.legacy_id} ${i.data.image_url}`);
  return { items, offCloudinary };
}

// ---------------------------------------------------------------------------------------------------------------
async function run(collection, items) {
  const { byLegacy, dupes } = await client.listByLegacyId(collection);
  if (dupes.length) say(`WARN ${collection}: duplicate legacy_id rows in EmDash: ${JSON.stringify(dupes.slice(0, 3))}`);
  const stats = { created: 0, updated: 0, differs: 0, unchanged: 0, failed: 0 };
  const manifest = [];
  const queue = [...items];
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try {
        const r = await upsert(client, collection, it.slug, it.data, byLegacy.get(it.data.legacy_id), { dry: DRY, update: UPDATE });
        stats[r.action]++;
        manifest.push({ legacy_id: it.data.legacy_id, ...r });
        if (r.action !== "unchanged") say(`${r.action} ${collection} ${it.data.legacy_id}${r.changed ? ` fields=${r.changed.join(",")}` : ""}`);
      } catch (e) {
        stats.failed++;
        manifest.push({ legacy_id: it.data.legacy_id, action: "failed", error: String(e.message).slice(0, 300) });
        say(`FAILED ${collection} ${it.data.legacy_id}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  writeFileSync(join(OUT, `${tag}.${collection}.manifest.json`), JSON.stringify(manifest, null, 1));
  say(`${collection}: ${items.length} legacy items, ${JSON.stringify(stats)}${DRY ? " (dry run)" : ""}`);
  return stats;
}

say(`MIG-3 import -> ${client.base}  source ${SOURCE}  only=${ONLY}${DRY ? " dry-run" : ""}${UPDATE ? " update" : ""}`);
if (!existsSync(join(SOURCE, "generated"))) {
  console.error(`no legacy generated data in ${SOURCE} (git submodule update --init src/content)`);
  process.exit(2);
}
let failed = 0;
if (ONLY !== "gallery") failed += (await run("podcasts", loadPodcast())).failed;
if (ONLY !== "podcast") {
  const { items, offCloudinary } = loadGallery();
  if (offCloudinary.length) {
    console.error(`STOP: ${offCloudinary.length} gallery image(s) are not on Cloudinary; uploading needs the owner's OK:\n${offCloudinary.join("\n")}`);
    process.exit(3);
  }
  say(`gallery: all ${items.length} images already on res.cloudinary.com (nothing to upload)`);
  failed += (await run("gallery", items)).failed;
}
process.exit(failed ? 1 : 0);
