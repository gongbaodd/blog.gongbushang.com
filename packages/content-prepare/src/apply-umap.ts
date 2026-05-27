import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { runUmap } from "./umap.ts";
import type { MetadataEntry } from "./types.ts";

export const UMAP_STATE_FILENAME = ".umap-state.json";

interface UmapCorpusEntry {
  file: string;
  embeddings: number[];
}

interface UmapState {
  inputHash: string;
  count: number;
}

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

export async function applyUmap2D(outputDir: string): Promise<void> {
  const allEntries = await readMetadataEntries(outputDir);
  const embeddedEntries = allEntries
    .filter(hasEmbeddings)
    .sort((left, right) => left.file.localeCompare(right.file));

  if (embeddedEntries.length < 2) {
    for (const metadataEntry of allEntries) {
      if (metadataEntry.umap2D) {
        const { umap2D: _removed, ...rest } = metadataEntry;
        await writeMetadataEntry(outputDir, rest);
      }
    }
    await clearUmapState(outputDir);
    console.log("ℹ️ Skipped UMAP: fewer than 2 embeddings");
    return;
  }

  const corpus = embeddedEntries.map(({ file, embeddings }) => ({
    file,
    embeddings,
  }));
  const inputHash = computeUmapInputHash(corpus);
  const cached = await readUmapState(outputDir);

  if (cached?.inputHash === inputHash && cached.count === embeddedEntries.length) {
    console.log("ℹ️ Skipped UMAP: embedding corpus unchanged");
    return;
  }

  const coordinates = await runUmap(embeddedEntries.map(({ embeddings }) => embeddings));

  if (coordinates.length !== embeddedEntries.length) {
    throw new Error(
      `UMAP returned ${coordinates.length} coordinates for ${embeddedEntries.length} embeddings`,
    );
  }

  for (let index = 0; index < embeddedEntries.length; index++) {
    const metadataEntry = embeddedEntries[index]!;
    const umap2D = coordinates[index]!;
    await writeMetadataEntry(outputDir, { ...metadataEntry, umap2D });
  }

  await writeUmapState(outputDir, {
    inputHash,
    count: embeddedEntries.length,
  });

  console.log(
    `✅ Updated umap2D for ${embeddedEntries.length} metadata file(s)`,
  );
}
