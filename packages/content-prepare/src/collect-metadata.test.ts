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

vi.mock("./geocode.ts", () => ({
  geocodeCities: vi.fn(),
}));

vi.mock("image-metadata", () => ({
  getColorSet: vi.fn(),
}));

import { collectMetadata } from "./collect-metadata.ts";
import { geocodeCities } from "./geocode.ts";
import { getColorSet } from "image-metadata";
import type { MetadataEntry } from "./types.ts";

const geocodeCitiesMock = geocodeCities as Mock;
const getColorSetMock = getColorSet as Mock;

let tmpRoot = "";
let docsDir = "";
let outputDir = "";
let traceDir = "";

async function writePost(relativePath: string, body: string) {
  const filePath = path.join(docsDir, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf-8");
}

async function readMetadata(slug: string): Promise<MetadataEntry> {
  const fileName = `${slug.replaceAll("/", "-")}.json`;
  const raw = await fs.readFile(path.join(outputDir, fileName), "utf-8");
  return JSON.parse(raw) as MetadataEntry;
}

describe("collectMetadata", () => {
  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "content-prepare-"));
    docsDir = path.join(tmpRoot, "docs");
    outputDir = path.join(tmpRoot, "metadata");
    traceDir = path.join(tmpRoot, "trace");

    geocodeCitiesMock.mockResolvedValue({
      city: ["Tokyo"],
      locations: [{ latitude: 35.6762, longitude: 139.6503 }],
    });
    getColorSetMock.mockResolvedValue({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  test("writes metadata for a new markdown post", async () => {
    await writePost(
      "2024/01/01/hello-world.md",
      `---
category: travel
city: Tokyo
cover:
  url: ./cover.png
  alt: Cover
---

# Hello
`,
    );

    await collectMetadata({ docsDir, outputDir, traceDir, googleApiKey: "key" });

    const entry = await readMetadata("2024/01/01/hello-world");
    expect(entry.file).toBe("2024/01/01/hello-world");
    expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry.id).toBe("2024/01/01/hello-world");
    expect(entry.href).toBe("/travel/2024/01/01/hello-world");
    expect(entry.title).toBe("Hello");
    expect(entry.content).toContain("Hello");
    expect(entry.category).toEqual({ label: "travel", href: "/travel" });
    expect(entry.tags).toEqual([]);
    expect(entry.city).toEqual(["Tokyo"]);
    expect(entry.locations).toEqual([
      { latitude: 35.6762, longitude: 139.6503 },
    ]);
    expect(entry.cover).toEqual({ url: "./cover.png", alt: "Cover" });
    expect(entry.colorSet).toEqual({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });
    expect(geocodeCitiesMock).toHaveBeenCalled();
    expect(getColorSetMock).toHaveBeenCalled();
  });

  test("skips posts whose content hash is unchanged", async () => {
    const content = `---
category: blog
title: Stable
---

# Stable
`;
    await writePost("2024/01/02/stable.md", content);

    await collectMetadata({ docsDir, outputDir, traceDir });
    const first = await readMetadata("2024/01/02/stable");

    geocodeCitiesMock.mockClear();
    getColorSetMock.mockClear();
    const writeSpy = vi.spyOn(fs, "writeFile");

    await collectMetadata({ docsDir, outputDir, traceDir });
    const second = await readMetadata("2024/01/02/stable");

    expect(second).toEqual(first);
    expect(geocodeCitiesMock).not.toHaveBeenCalled();
    expect(getColorSetMock).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  test("reuses cover metadata when cover url is unchanged", async () => {
    await writePost(
      "2024/01/03/with-cover.md",
      `---
category: blog
cover:
  url: ./same-cover.png
---

# Cover
`,
    );

    await collectMetadata({ docsDir, outputDir, traceDir });
    getColorSetMock.mockClear();

    await writePost(
      "2024/01/03/with-cover.md",
      `---
category: blog
cover:
  url: ./same-cover.png
---

# Cover updated
`,
    );

    await collectMetadata({ docsDir, outputDir, traceDir });
    const entry = await readMetadata("2024/01/03/with-cover");

    expect(entry.cover).toEqual({ url: "./same-cover.png" });
    expect(entry.colorSet).toEqual({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });
    expect(entry.title).toBe("Cover updated");
    expect(getColorSetMock).not.toHaveBeenCalled();
  });

  test("backfills data fields without re-geocoding when hash is unchanged", async () => {
    const content = `---
category: travel
city: Tokyo
cover:
  url: ./cover.png
---

# Hello
`;
    await writePost("2024/01/06/backfill.md", content);
    await collectMetadata({ docsDir, outputDir, traceDir, googleApiKey: "key" });

    const hash = (await readMetadata("2024/01/06/backfill")).hash;
    await fs.writeFile(
      path.join(outputDir, "2024-01-06-backfill.json"),
      JSON.stringify({
        file: "2024/01/06/backfill",
        hash,
        city: ["Tokyo"],
        locations: [{ latitude: 35.6762, longitude: 139.6503 }],
        cover: { url: "./cover.png" },
        colorSet: { bgColor: "#111111", titleColor: "#eeeeee" },
      }),
      "utf-8",
    );

    geocodeCitiesMock.mockClear();
    getColorSetMock.mockClear();

    await collectMetadata({ docsDir, outputDir, traceDir, googleApiKey: "key" });
    const entry = await readMetadata("2024/01/06/backfill");

    expect(entry.id).toBe("2024/01/06/backfill");
    expect(entry.title).toBe("Hello");
    expect(entry.content).toContain("Hello");
    expect(entry.city).toEqual(["Tokyo"]);
    expect(entry.colorSet).toEqual({
      bgColor: "#111111",
      titleColor: "#eeeeee",
    });
    expect(geocodeCitiesMock).not.toHaveBeenCalled();
    expect(getColorSetMock).not.toHaveBeenCalled();
  });

  test("loads legacy metadata.json and removes orphaned per-post files", async () => {
    await writePost(
      "2024/01/04/active.md",
      `---
category: blog
---

# Active
`,
    );

    const legacyPath = path.join(tmpRoot, "metadata.json");
    await fs.writeFile(
      legacyPath,
      JSON.stringify([
        {
          file: "2024/01/04/active",
          hash: "legacy-hash",
          city: ["Kyoto"],
          locations: [{ latitude: 35.0116, longitude: 135.7681 }],
        },
      ]),
      "utf-8",
    );

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, "2024-01-05-removed.json"),
      JSON.stringify({ file: "2024/01/05/removed", hash: "old" }),
      "utf-8",
    );

    await collectMetadata({ docsDir, outputDir, traceDir });

    const entry = await readMetadata("2024/01/04/active");
    expect(entry.hash).not.toBe("legacy-hash");
    expect(entry.file).toBe("2024/01/04/active");
    expect(entry.id).toBe("2024/01/04/active");
    expect(entry.title).toBe("Active");

    await expect(
      fs.access(path.join(outputDir, "2024-01-05-removed.json")),
    ).rejects.toThrow();
    await expect(fs.access(legacyPath)).rejects.toThrow();
  });
});
