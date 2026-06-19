import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { getColorSet } from "image-metadata";
import { toGalleryId, toTraceSvgBasename } from "./path-utils.ts";
import type {
  CollectGalleryOptions,
  GalleryData,
  GalleryEntry,
  GallerySource,
} from "./types.ts";

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function loadExistingGallery(
  outputFile: string,
): Promise<Map<string, GalleryEntry>> {
  const entries = new Map<string, GalleryEntry>();

  try {
    const raw = await fs.readFile(outputFile, "utf-8");
    const data = JSON.parse(raw) as GalleryData;
    for (const image of data.images ?? []) {
      entries.set(image.id, image);
    }
  } catch {
    // gallery.json does not exist yet
  }

  return entries;
}

async function processImage(
  source: GallerySource,
  id: string,
  options: CollectGalleryOptions,
): Promise<GalleryEntry> {
  const colorSet = await getColorSet(source.image, {
    baseDir: options.baseDir,
    relPath: id,
    saveTraceToDir: options.traceDir,
    useDepthPrep: options.useDepthPrep ?? false,
  });

  return {
    id,
    file: id,
    hash: "",
    image: source.image,
    doc: source.doc,
    colorSet,
  };
}

export async function collectGallery(
  options: CollectGalleryOptions,
): Promise<void> {
  const {
    galleryDir,
    outputFile,
    traceDir,
    regenerateTraces = false,
    tracesOnly = false,
  } = options;

  await fs.mkdir(traceDir, { recursive: true });
  await fs.mkdir(path.dirname(outputFile), { recursive: true });

  const oldEntries = await loadExistingGallery(outputFile);
  const files = await fg("**/*.json", { cwd: galleryDir, absolute: true });
  const activeIds = new Set<string>();
  const images: GalleryEntry[] = [];
  let changedCount = 0;

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf-8");
      const contentHash = hashContent(raw);
      const source = JSON.parse(raw) as GallerySource;
      const id = toGalleryId(path.relative(galleryDir, file));
      activeIds.add(id);

      const old = oldEntries.get(id);
      if (!regenerateTraces && !tracesOnly && old?.hash === contentHash) {
        images.push(old);
        continue;
      }

      let entry: GalleryEntry;

      if (
        !regenerateTraces &&
        !tracesOnly &&
        old?.image === source.image &&
        old.colorSet
      ) {
        entry = {
          ...old,
          hash: contentHash,
          doc: source.doc,
        };
      } else {
        const processed = await processImage(source, id, options);
        entry = { ...processed, hash: contentHash };
      }

      images.push(entry);
      changedCount++;
      console.log(`✅ Processed: ${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error processing ${file}:`, message);
    }
  }

  if (tracesOnly) {
    console.log(
      `\n✏️ Regenerated ${changedCount} gallery trace(s) in ${traceDir}`,
    );
    return;
  }

  images.sort((a, b) => a.id.localeCompare(b.id));

  for (const [id] of oldEntries) {
    if (!activeIds.has(id)) {
      const svgPath = path.join(traceDir, toTraceSvgBasename(id));
      try {
        await fs.unlink(svgPath);
        console.log(`🗑️ Removed orphaned trace: ${id}`);
      } catch {
        // svg may not exist
      }
    }
  }

  const galleryData: GalleryData = {
    lastUpdated: new Date().toISOString(),
    images,
  };

  await fs.writeFile(
    outputFile,
    JSON.stringify(galleryData, null, 2),
    "utf-8",
  );

  console.log(
    `\n📦 Gallery updated in ${outputFile} (${changedCount} image(s) changed)`,
  );
  console.log(`📁 Trace SVGs saved to ${traceDir}/`);
}
