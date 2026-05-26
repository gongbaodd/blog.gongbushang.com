import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import fg from "fast-glob";
import { getColorSet } from "image-metadata";
import { isEmbeddingServerRunning } from "post-embedding";
import {
  buildSeriesNameMap,
  extractDataFields,
  type FrontmatterData,
} from "./data-field.ts";
import { embedMetadata } from "./embedding.ts";
import { geocodeCities } from "./geocode.ts";
import { toMetadataFileBasename, toMetadataSlug } from "./path-utils.ts";
import type {
  CollectMetadataOptions,
  MetadataEntry,
} from "./types.ts";

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function metadataFilePath(outputDir: string, slug: string): string {
  return path.join(outputDir, toMetadataFileBasename(slug));
}

function hasDataFields(entry: MetadataEntry | undefined): boolean {
  return Boolean(entry?.id && entry.content != null);
}

function hasEmbeddings(entry: MetadataEntry | undefined): boolean {
  return Array.isArray(entry?.embeddings) && entry.embeddings.length > 0;
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

interface ParsedPost {
  file: string;
  raw: string;
  contentHash: string;
  frontmatter: FrontmatterData;
  body: string;
  relPath: string;
}

async function parsePosts(docsDir: string, files: string[]): Promise<ParsedPost[]> {
  const parsed: ParsedPost[] = [];

  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf-8");
      const contentHash = hashContent(raw);
      const { data, content: body } = matter(raw);
      const frontmatter = data as FrontmatterData;
      const relPath = toMetadataSlug(path.relative(docsDir, file));

      parsed.push({
        file,
        raw,
        contentHash,
        frontmatter,
        body,
        relPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error parsing ${file}:`, message);
    }
  }

  return parsed;
}

async function writeMetadataEntry(
  outputDir: string,
  merged: MetadataEntry,
): Promise<void> {
  const outPath = metadataFilePath(outputDir, merged.file);
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
}

export async function collectMetadata(
  options: CollectMetadataOptions,
): Promise<void> {
  const { docsDir, outputDir, traceDir, googleApiKey, embeddingOptions } =
    options;
  const legacyJsonPath = path.join(path.dirname(outputDir), "metadata.json");

  const embeddingServerRunning =
    await isEmbeddingServerRunning(embeddingOptions);
  if (!embeddingServerRunning) {
    throw new Error(
      "Embedding server is not running. Start LM Studio (or set EMBEDDING_BASE_URL) and ensure the embedding model is loaded.",
    );
  }

  await fs.mkdir(outputDir, { recursive: true });

  const oldData = await loadExistingMetadata(outputDir, legacyJsonPath);
  const files = await fg("**/*.md", { cwd: docsDir, absolute: true });
  const parsedPosts = await parsePosts(docsDir, files);
  const seriesNameMap = buildSeriesNameMap(
    parsedPosts.map(({ frontmatter }) => frontmatter),
  );
  const activeSlugs = new Set(parsedPosts.map((post) => post.relPath));
  let changedCount = 0;

  for (const post of parsedPosts) {
    const { file, contentHash, frontmatter, body, relPath } = post;
    const old = oldData[relPath];
    const hashUnchanged = old?.hash === contentHash;

    if (hashUnchanged && hasDataFields(old) && hasEmbeddings(old)) {
      continue;
    }

    const dataFields = await extractDataFields(
      relPath,
      frontmatter,
      body,
      seriesNameMap,
    );

    if (hashUnchanged && old) {
      const merged: MetadataEntry = {
        ...old,
        ...dataFields,
      };
      merged.embeddings = await embedMetadata(merged, embeddingOptions);
      await writeMetadataEntry(outputDir, merged);
      changedCount++;
      console.log(`✅ Backfilled data fields: ${relPath}`);
      continue;
    }

    const merged: MetadataEntry = {
      file: relPath,
      hash: contentHash,
      ...dataFields,
    };

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

    merged.embeddings = await embedMetadata(merged, embeddingOptions);

    await writeMetadataEntry(outputDir, merged);
    changedCount++;
    console.log(`✅ Processed: ${relPath}`);
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
