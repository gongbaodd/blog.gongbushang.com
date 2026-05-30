import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runUmap } from "./umap.ts";
import { computeUmapParamsHash } from "./umap-params.ts";
import type { MetadataEntry } from "./types.ts";

export const UMAP_STATE_FILENAME = ".umap-state.json";

interface UmapCorpusEntry {
  file: string;
  embeddings: number[];
}

export interface UmapState {
  inputHash: string;
  count: number;
  paramsHash: string;
  coordinates?: Record<string, [number, number]>;
}

/** Legacy per-post metadata may still contain umap2D before migration. */
type LegacyMetadataEntry = MetadataEntry & { umap2D?: [number, number] };

export function computeUmapInputHash(entries: UmapCorpusEntry[]): string {
  const hash = crypto.createHash("sha256");
  const sorted = [...entries].sort((left, right) =>
    left.file.localeCompare(right.file),
  );

  for (const item of sorted) {
    hash.update(item.file);
    hash.update("\0");
    hash.update(item.embeddings.join(","));
    hash.update("\n");
  }

  return hash.digest("hex");
}

function hasEmbeddings(entry: MetadataEntry): entry is MetadataEntry & {
  embeddings: number[];
} {
  return Array.isArray(entry.embeddings) && entry.embeddings.length > 0;
}

async function readMetadataEntries(outputDir: string): Promise<MetadataEntry[]> {
  const files = await fs.readdir(outputDir);
  const entries: MetadataEntry[] = [];

  for (const file of files.filter(
    (name) => name.endsWith(".json") && name !== UMAP_STATE_FILENAME,
  )) {
    const raw = await fs.readFile(path.join(outputDir, file), "utf-8");
    entries.push(JSON.parse(raw) as MetadataEntry);
  }

  return entries;
}

async function writeMetadataEntry(
  outputDir: string,
  metadataEntry: MetadataEntry,
): Promise<void> {
  const fileName = `${metadataEntry.file.replaceAll("/", "-")}.json`;
  await fs.writeFile(
    path.join(outputDir, fileName),
    JSON.stringify(metadataEntry, null, 2),
    "utf-8",
  );
}

async function readUmapState(outputDir: string): Promise<UmapState | undefined> {
  try {
    const raw = await fs.readFile(
      path.join(outputDir, UMAP_STATE_FILENAME),
      "utf-8",
    );
    return JSON.parse(raw) as UmapState;
  } catch {
    return undefined;
  }
}

async function writeUmapState(
  outputDir: string,
  state: UmapState,
): Promise<void> {
  await fs.writeFile(
    path.join(outputDir, UMAP_STATE_FILENAME),
    JSON.stringify(state, null, 2),
    "utf-8",
  );
}

async function clearUmapState(outputDir: string): Promise<void> {
  try {
    await fs.unlink(path.join(outputDir, UMAP_STATE_FILENAME));
  } catch {
    // cache file not present
  }
}

async function stripUmap2DFromAllMetadata(outputDir: string): Promise<void> {
  const allEntries = await readMetadataEntries(outputDir);

  for (const metadataEntry of allEntries) {
    const legacy = metadataEntry as LegacyMetadataEntry;
    if (legacy.umap2D) {
      const { umap2D: _removed, ...rest } = legacy;
      await writeMetadataEntry(outputDir, rest);
    }
  }
}

function collectLegacyCoordinates(
  embeddedEntries: LegacyMetadataEntry[],
): Record<string, [number, number]> | undefined {
  const coordinates: Record<string, [number, number]> = {};

  for (const entry of embeddedEntries) {
    if (!entry.umap2D) {
      return undefined;
    }
    coordinates[entry.file] = entry.umap2D;
  }

  return coordinates;
}

function buildCoordinatesMap(
  embeddedEntries: MetadataEntry[],
  coordinateList: [number, number][],
): Record<string, [number, number]> {
  const coordinates: Record<string, [number, number]> = {};

  for (let index = 0; index < embeddedEntries.length; index++) {
    coordinates[embeddedEntries[index]!.file] = coordinateList[index]!;
  }

  return coordinates;
}

export async function applyUmap2D(outputDir: string): Promise<void> {
  const allEntries = await readMetadataEntries(outputDir);
  const embeddedEntries = allEntries
    .filter(hasEmbeddings)
    .sort((left, right) => left.file.localeCompare(right.file));

  if (embeddedEntries.length < 2) {
    await stripUmap2DFromAllMetadata(outputDir);
    await clearUmapState(outputDir);
    console.log("ℹ️ Skipped UMAP: fewer than 2 embeddings");
    return;
  }

  const corpus = embeddedEntries.map(({ file, embeddings }) => ({
    file,
    embeddings,
  }));
  const inputHash = computeUmapInputHash(corpus);
  const paramsHash = computeUmapParamsHash();
  const cached = await readUmapState(outputDir);

  if (
    cached?.inputHash === inputHash &&
    cached.count === embeddedEntries.length &&
    cached.paramsHash === paramsHash
  ) {
    if (cached.coordinates && Object.keys(cached.coordinates).length > 0) {
      await stripUmap2DFromAllMetadata(outputDir);
      console.log("ℹ️ Skipped UMAP: embedding corpus unchanged");
      return;
    }

    const migrated = collectLegacyCoordinates(
      embeddedEntries as LegacyMetadataEntry[],
    );
    if (migrated) {
      await writeUmapState(outputDir, { ...cached, coordinates: migrated });
      await stripUmap2DFromAllMetadata(outputDir);
      console.log("ℹ️ Migrated umap2D to .umap-state.json");
      return;
    }
  }

  const coordinateList = await runUmap(
    embeddedEntries.map(({ embeddings }) => embeddings),
  );

  if (coordinateList.length !== embeddedEntries.length) {
    throw new Error(
      `UMAP returned ${coordinateList.length} coordinates for ${embeddedEntries.length} embeddings`,
    );
  }

  const coordinates = buildCoordinatesMap(embeddedEntries, coordinateList);

  await writeUmapState(outputDir, {
    inputHash,
    count: embeddedEntries.length,
    paramsHash,
    coordinates,
  });
  await stripUmap2DFromAllMetadata(outputDir);

  console.log(
    `✅ Updated umap2D for ${embeddedEntries.length} metadata file(s)`,
  );
}
