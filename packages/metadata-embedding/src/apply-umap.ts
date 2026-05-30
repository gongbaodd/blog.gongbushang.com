import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PODCAST_COVER_DIR,
  POST_METADATA_DIR,
  POST_UMAP_STATE,
} from "consts/config.js";
import { runUmap } from "./umap.ts";
import { computeUmapParamsHash } from "./umap-params.ts";

export const UMAP_STATE_FILENAME = ".umap-state.json";

export interface UmapCorpusEntry {
  key: string;
  embeddings: number[];
}

export interface UmapState {
  inputHash: string;
  count: number;
  paramsHash: string;
  coordinates?: Record<string, [number, number]>;
}

export interface UmapSourceConfig {
  dir: string;
  getKey: (entry: Record<string, unknown>) => string;
  toBasename?: (key: string) => string;
}

type JsonRecord = Record<string, unknown>;

const defaultToBasename = (key: string): string => key.replaceAll("/", "-");

export function computeUmapInputHash(entries: UmapCorpusEntry[]): string {
  const hash = crypto.createHash("sha256");
  const sorted = [...entries].sort((left, right) =>
    left.key.localeCompare(right.key),
  );

  for (const item of sorted) {
    hash.update(item.key);
    hash.update("\0");
    hash.update(item.embeddings.join(","));
    hash.update("\n");
  }

  return hash.digest("hex");
}

function hasEmbeddings(
  entry: JsonRecord,
): entry is JsonRecord & { embeddings: number[] } {
  return Array.isArray(entry.embeddings) && entry.embeddings.length > 0;
}

async function readJsonEntries(dir: string): Promise<JsonRecord[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const entries: JsonRecord[] = [];
  for (const file of files.filter(
    (name) =>
      name.endsWith(".json") &&
      !name.startsWith(".") &&
      name !== UMAP_STATE_FILENAME,
  )) {
    const raw = await fs.readFile(path.join(dir, file), "utf-8");
    entries.push(JSON.parse(raw) as JsonRecord);
  }

  return entries;
}

async function writeJsonEntry(
  dir: string,
  entry: JsonRecord,
  basename: string,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, `${basename}.json`),
    JSON.stringify(entry, null, 2),
    "utf-8",
  );
}

async function readUmapStateFile(
  statePath: string,
): Promise<UmapState | undefined> {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    return JSON.parse(raw) as UmapState;
  } catch {
    return undefined;
  }
}

async function writeUmapStateFile(
  statePath: string,
  state: UmapState,
): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

async function clearUmapStateFile(statePath: string): Promise<void> {
  try {
    await fs.unlink(statePath);
  } catch {
    // cache file not present
  }
}

async function stripUmap2DFromSource(source: UmapSourceConfig): Promise<void> {
  const toBasename = source.toBasename ?? defaultToBasename;
  const entries = await readJsonEntries(source.dir);

  for (const entry of entries) {
    if (!entry.umap2D) continue;
    const { umap2D: _removed, ...rest } = entry;
    const key = source.getKey(entry);
    await writeJsonEntry(source.dir, rest, toBasename(key));
  }
}

function collectLegacyCoordinates(
  embedded: Array<{ key: string; entry: JsonRecord }>,
): Record<string, [number, number]> | undefined {
  const coordinates: Record<string, [number, number]> = {};

  for (const { key, entry } of embedded) {
    const umap2D = entry.umap2D as [number, number] | undefined;
    if (!umap2D) {
      return undefined;
    }
    coordinates[key] = umap2D;
  }

  return coordinates;
}

function buildCoordinatesMap(
  embedded: Array<{ key: string }>,
  coordinateList: [number, number][],
): Record<string, [number, number]> {
  const coordinates: Record<string, [number, number]> = {};

  for (let index = 0; index < embedded.length; index++) {
    coordinates[embedded[index]!.key] = coordinateList[index]!;
  }

  return coordinates;
}

export async function applyCombinedUmap2D(
  sources: UmapSourceConfig[],
  statePath: string,
): Promise<void> {
  const embedded: Array<{
    key: string;
    embeddings: number[];
    entry: JsonRecord;
  }> = [];

  for (const source of sources) {
    const entries = await readJsonEntries(source.dir);
    for (const entry of entries) {
      if (!hasEmbeddings(entry)) continue;
      embedded.push({
        key: source.getKey(entry),
        embeddings: entry.embeddings,
        entry,
      });
    }
  }

  embedded.sort((left, right) => left.key.localeCompare(right.key));

  if (embedded.length < 2) {
    for (const source of sources) {
      await stripUmap2DFromSource(source);
    }
    await clearUmapStateFile(statePath);
    console.log("ℹ️ Skipped UMAP: fewer than 2 embeddings");
    return;
  }

  const corpus: UmapCorpusEntry[] = embedded.map(({ key, embeddings }) => ({
    key,
    embeddings,
  }));
  const inputHash = computeUmapInputHash(corpus);
  const paramsHash = computeUmapParamsHash();
  const cached = await readUmapStateFile(statePath);

  if (
    cached?.inputHash === inputHash &&
    cached.count === embedded.length &&
    cached.paramsHash === paramsHash
  ) {
    if (cached.coordinates && Object.keys(cached.coordinates).length > 0) {
      for (const source of sources) {
        await stripUmap2DFromSource(source);
      }
      console.log("ℹ️ Skipped UMAP: embedding corpus unchanged");
      return;
    }

    const migrated = collectLegacyCoordinates(embedded);
    if (migrated) {
      await writeUmapStateFile(statePath, { ...cached, coordinates: migrated });
      for (const source of sources) {
        await stripUmap2DFromSource(source);
      }
      console.log("ℹ️ Migrated umap2D to .umap-state.json");
      return;
    }
  }

  const coordinateList = await runUmap(
    embedded.map(({ embeddings }) => embeddings),
  );

  if (coordinateList.length !== embedded.length) {
    throw new Error(
      `UMAP returned ${coordinateList.length} coordinates for ${embedded.length} embeddings`,
    );
  }

  const coordinates = buildCoordinatesMap(embedded, coordinateList);

  await writeUmapStateFile(statePath, {
    inputHash,
    count: embedded.length,
    paramsHash,
    coordinates,
  });

  for (const source of sources) {
    await stripUmap2DFromSource(source);
  }

  console.log(
    `✅ Updated umap2D for ${embedded.length} embedding(s) in combined corpus`,
  );
}

export async function applyUmap2D(
  outputDir: string,
  options?: Pick<UmapSourceConfig, "getKey" | "toBasename">,
): Promise<void> {
  const getKey =
    options?.getKey ??
    ((entry: JsonRecord) => {
      const file = entry.file;
      if (typeof file !== "string") {
        throw new Error("applyUmap2D requires entry.file or a custom getKey");
      }
      return file;
    });

  await applyCombinedUmap2D(
    [
      {
        dir: outputDir,
        getKey,
        toBasename: options?.toBasename ?? defaultToBasename,
      },
    ],
    path.join(outputDir, UMAP_STATE_FILENAME),
  );
}

export async function applyBlogUmapCorpus(repoRoot: string): Promise<void> {
  const statePath = path.join(repoRoot, POST_UMAP_STATE);
  const sources: UmapSourceConfig[] = [
    {
      dir: path.join(repoRoot, POST_METADATA_DIR),
      getKey: (entry) => entry.file as string,
      toBasename: (key) => key.replaceAll("/", "-"),
    },
  ];

  const podcastDir = path.join(repoRoot, PODCAST_COVER_DIR);
  try {
    await fs.access(podcastDir);
    sources.push({
      dir: podcastDir,
      getKey: (entry) => entry.id as string,
      toBasename: (key) => key,
    });
  } catch {
    // podcast dir not created yet
  }

  await applyCombinedUmap2D(sources, statePath);
}
