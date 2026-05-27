import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type Mock,
} from "vitest";

vi.mock("./umap.ts", () => ({
  runUmap: vi.fn(),
}));

import {
  applyUmap2D,
  computeUmapInputHash,
  UMAP_STATE_FILENAME,
} from "./apply-umap.ts";
import { runUmap } from "./umap.ts";
import type { MetadataEntry } from "./types.ts";

const runUmapMock = runUmap as Mock;

function entry(
  file: string,
  embeddings: number[],
  umap2D?: [number, number],
): MetadataEntry {
  return {
    file,
    hash: "hash",
    id: file,
    href: `/${file}`,
    title: file,
    date: "2025-01-01T00:00:00.000Z",
    content: "content",
    category: { label: "tech", href: "/tech" },
    tags: [],
    embeddings,
    umap2D,
  };
}

async function writeMetadata(
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

async function readMetadata(
  outputDir: string,
  slug: string,
): Promise<MetadataEntry> {
  const fileName = `${slug.replaceAll("/", "-")}.json`;
  const raw = await fs.readFile(path.join(outputDir, fileName), "utf-8");
  return JSON.parse(raw) as MetadataEntry;
}

let tmpRoot = "";
let outputDir = "";

describe("computeUmapInputHash", () => {
  test("is stable for the same corpus", () => {
    const corpus = [
      { file: "a/post", embeddings: [0.1, 0.2] },
      { file: "b/post", embeddings: [0.3, 0.4] },
    ];

    expect(computeUmapInputHash(corpus)).toBe(computeUmapInputHash(corpus));
  });

  test("changes when one embedding value changes", () => {
    const before = computeUmapInputHash([
      { file: "a/post", embeddings: [0.1, 0.2] },
      { file: "b/post", embeddings: [0.3, 0.4] },
    ]);
    const after = computeUmapInputHash([
      { file: "a/post", embeddings: [0.1, 0.21] },
      { file: "b/post", embeddings: [0.3, 0.4] },
    ]);

    expect(after).not.toBe(before);
  });

  test("is stable regardless of input order", () => {
    const first = computeUmapInputHash([
      { file: "a/post", embeddings: [0.1, 0.2] },
      { file: "b/post", embeddings: [0.3, 0.4] },
    ]);
    const second = computeUmapInputHash([
      { file: "b/post", embeddings: [0.3, 0.4] },
      { file: "a/post", embeddings: [0.1, 0.2] },
    ]);

    expect(second).toBe(first);
  });
});

describe("applyUmap2D", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "apply-umap-"));
    outputDir = path.join(tmpRoot, "metadata");
    await fs.mkdir(outputDir, { recursive: true });
    runUmapMock.mockReset();
    runUmapMock.mockResolvedValue([
      [1, 2],
      [3, 4],
    ]);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test("skips UMAP when cache hash matches", async () => {
    const corpus = [
      entry("a/post", [0.1, 0.2]),
      entry("b/post", [0.3, 0.4]),
    ];
    await writeMetadata(outputDir, corpus[0]!);
    await writeMetadata(outputDir, corpus[1]!);

    const inputHash = computeUmapInputHash(
      corpus.map(({ file, embeddings }) => ({ file, embeddings })),
    );
    await fs.writeFile(
      path.join(outputDir, UMAP_STATE_FILENAME),
      JSON.stringify({ inputHash, count: 2 }),
      "utf-8",
    );

    await applyUmap2D(outputDir);

    expect(runUmapMock).not.toHaveBeenCalled();
  });

  test("writes umap2D when cache hash mismatches", async () => {
    await writeMetadata(outputDir, entry("a/post", [0.1, 0.2]));
    await writeMetadata(outputDir, entry("b/post", [0.3, 0.4]));

    await applyUmap2D(outputDir);

    expect(runUmapMock).toHaveBeenCalledWith([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(await readMetadata(outputDir, "a/post")).toMatchObject({
      umap2D: [1, 2],
    });
    expect(await readMetadata(outputDir, "b/post")).toMatchObject({
      umap2D: [3, 4],
    });

    const stateRaw = await fs.readFile(
      path.join(outputDir, UMAP_STATE_FILENAME),
      "utf-8",
    );
    expect(JSON.parse(stateRaw)).toMatchObject({ count: 2 });
  });

  test("skips UMAP when fewer than two embeddings exist", async () => {
    await writeMetadata(outputDir, entry("a/post", [0.1, 0.2], [9, 9]));

    await applyUmap2D(outputDir);

    expect(runUmapMock).not.toHaveBeenCalled();
    expect((await readMetadata(outputDir, "a/post")).umap2D).toBeUndefined();
    await expect(
      fs.access(path.join(outputDir, UMAP_STATE_FILENAME)),
    ).rejects.toThrow();
  });

  test("clears stale umap2D when corpus drops below two entries", async () => {
    await writeMetadata(outputDir, entry("a/post", [0.1, 0.2], [9, 9]));
    await writeMetadata(
      outputDir,
      entry("b/post", [0.3, 0.4], [8, 8]),
    );

    await applyUmap2D(outputDir);
    await fs.unlink(path.join(outputDir, "b-post.json"));

    await applyUmap2D(outputDir);

    expect(runUmapMock).toHaveBeenCalledTimes(1);
    expect((await readMetadata(outputDir, "a/post")).umap2D).toBeUndefined();
  });
});
