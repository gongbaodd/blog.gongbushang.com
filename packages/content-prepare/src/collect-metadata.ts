import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import { getColorSet } from "image-metadata";
import { geocodeCities } from "./geocode.ts";
import { toMetadataSlug } from "./path-utils.ts";
import type {
  CollectMetadataOptions,
  MetadataEntry,
} from "./types.ts";

interface FrontmatterData {
  city?: string | string[];
  cover?: { url: string; alt?: string };
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
  const { docsDir, outputFile, traceDir, googleApiKey } = options;
  const files = await fg("**/*.md", { cwd: docsDir, absolute: true });

  let oldData: Record<string, MetadataEntry> = {};
  try {
    const raw = await fs.readFile(outputFile, "utf-8");
    const arr = JSON.parse(raw) as MetadataEntry[];
    oldData = Object.fromEntries(arr.map((item) => [item.file, item]));
  } catch {
    console.log("ℹ️ No existing metadata.json found, starting fresh.");
  }

  const results = Object.values(oldData);
  const indexByFile = Object.fromEntries(
    results.map((item, idx) => [item.file, idx]),
  );

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf-8");
      const { data } = matter(raw);
      const frontmatter = data as FrontmatterData;
      const relPath = toMetadataSlug(path.relative(docsDir, file));
      const old = oldData[relPath];
      const locationPart = await processLocation(
        frontmatter,
        old,
        googleApiKey,
      );
      const coverPart = await processCover(
        frontmatter,
        old,
        file,
        relPath,
        traceDir,
      );

      let didChange = false;
      if (locationPart || coverPart || !old) {
        const merged: MetadataEntry = old ? { ...old } : { file: relPath };
        if (locationPart) {
          merged.city = locationPart.city;
          merged.locations = locationPart.locations;
        }
        if (coverPart) {
          merged.cover = coverPart.cover;
          merged.colorSet = coverPart.colorSet;
        }

        const idx = indexByFile[relPath];
        if (typeof idx === "number") {
          const before = JSON.stringify(results[idx]);
          const after = JSON.stringify(merged);
          if (before !== after) {
            results[idx] = merged;
            didChange = true;
          }
        } else {
          indexByFile[relPath] = results.length;
          results.push(merged);
          didChange = true;
        }
      }

      if (didChange) {
        console.log(`✅ Processed: ${relPath}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error parsing ${file}:`, message);
    }
  }

  await fs.writeFile(outputFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n📦 Metadata updated in ${outputFile}`);
}
