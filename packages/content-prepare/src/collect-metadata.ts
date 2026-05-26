import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import { getColorSet } from "image-metadata";
import { geocodeCities } from "./geocode.ts";
import { toMetadataFileBasename, toMetadataSlug } from "./path-utils.ts";
import type {
  CollectMetadataOptions,
  MetadataEntry,
} from "./types.ts";

interface FrontmatterData {
  city?: string | string[];
  cover?: { url: string; alt?: string };
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function metadataFilePath(outputDir: string, slug: string): string {
  return path.join(outputDir, toMetadataFileBasename(slug));
}

async function loadExistingMetadata(
  outputDir: string,
  legacyJsonPath: string,
): Promise<Record<string, MetadataEntry>> {
  const oldData: Record<string, MetadataEntry> = {};

  try {
    const raw = await fs.readFile(legacyJsonPath, "utf-8");
    const arr = JSON.parse(raw) as MetadataEntry[];
    for (const item of arr) {
      oldData[item.file] = item;
    }
  } catch {
    // no legacy metadata.json
  }

  try {
    const files = await fs.readdir(outputDir);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(outputDir, file), "utf-8");
      const entry = JSON.parse(raw) as MetadataEntry;
      oldData[entry.file] = entry;
    }
  } catch {
    // metadata dir does not exist yet
  }

  return oldData;
}

async function processLocation(
  data: FrontmatterData,
  old: MetadataEntry | undefined,
  googleApiKey: string | undefined,
) {
  if (!data?.city) return undefined;
  const cityList = Array.isArray(data.city) ? data.city : [data.city];
  return geocodeCities(cityList, googleApiKey, old);
}

async function processCover(
  data: FrontmatterData,
  old: MetadataEntry | undefined,
  file: string,
  relPath: string,
  traceDir: string,
) {
  if (!data?.cover?.url) return undefined;

  if (old?.cover?.url === data.cover.url) {
    return undefined;
  }

  const colorSet = await getColorSet(data.cover.url, {
    baseDir: path.dirname(file),
    relPath,
    saveTraceToDir: traceDir,
  });
  return {
    cover: data.cover,
    colorSet,
  };
}

export async function collectMetadata(
  options: CollectMetadataOptions,
): Promise<void> {
  const { docsDir, outputDir, traceDir, googleApiKey } = options;
  const legacyJsonPath = path.join(path.dirname(outputDir), "metadata.json");

  await fs.mkdir(outputDir, { recursive: true });

  const oldData = await loadExistingMetadata(outputDir, legacyJsonPath);
  const files = await fg("**/*.md", { cwd: docsDir, absolute: true });
  const activeSlugs = new Set<string>();
  let changedCount = 0;

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf-8");
      const contentHash = hashContent(raw);
      const { data } = matter(raw);
      const frontmatter = data as FrontmatterData;
      const relPath = toMetadataSlug(path.relative(docsDir, file));
      activeSlugs.add(relPath);
      const old = oldData[relPath];

      if (old?.hash === contentHash) {
        continue;
      }

      const merged: MetadataEntry = { file: relPath, hash: contentHash };

      if (frontmatter.city) {
        const locationPart = await processLocation(
          frontmatter,
          old,
          googleApiKey,
        );
        if (locationPart) {
          merged.city = locationPart.city;
          merged.locations = locationPart.locations;
        }
      }

      if (frontmatter.cover?.url) {
        const coverPart = await processCover(
          frontmatter,
          old,
          file,
          relPath,
          traceDir,
        );
        if (coverPart) {
          merged.cover = coverPart.cover;
          merged.colorSet = coverPart.colorSet;
        } else if (old?.cover?.url === frontmatter.cover.url) {
          merged.cover = old.cover;
          merged.colorSet = old.colorSet;
        }
      }

      const outPath = metadataFilePath(outputDir, relPath);
      await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
      changedCount++;
      console.log(`✅ Processed: ${relPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error parsing ${file}:`, message);
    }
  }

  try {
    const existing = await fs.readdir(outputDir);
    for (const file of existing.filter((f) => f.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(outputDir, file), "utf-8");
      const entry = JSON.parse(raw) as MetadataEntry;
      if (!activeSlugs.has(entry.file)) {
        await fs.unlink(path.join(outputDir, file));
        console.log(`🗑️ Removed orphaned metadata: ${entry.file}`);
      }
    }
  } catch {
    // ignore cleanup errors
  }

  try {
    await fs.unlink(legacyJsonPath);
    console.log("ℹ️ Removed legacy metadata.json");
  } catch {
    // legacy file not present
  }

  console.log(
    `\n📦 Metadata updated in ${outputDir} (${changedCount} file(s) changed)`,
  );
}
