import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import {
  articleModifiedTime,
  clearSeoCache,
  hasSeoOverride,
  isMissingTableError,
  loadSeoByContentId,
  resolvePostSeo,
  rowToSeo,
  type ContentSeo,
} from "./seo";
import { isNoindexedPage, readNoindexIds } from "../../scripts/seo/noindex-list.mjs";

const mockExecute = vi.fn();
vi.mock("emdash/runtime", () => ({
  getDb: async () => ({ selectFrom: () => ({ select: () => ({ where: () => ({ execute: () => mockExecute() }) }) }) }),
}));

const base = {
  title: "Hello",
  description: "Excerpt",
  image: "https://res.cloudinary.com/x/cover.jpg",
  siteUrl: "https://growgen.xyz",
  path: "/2025/02/21/hello/",
};
const none: ContentSeo = { title: null, description: null, image: null, canonical: null, noIndex: false };

describe("resolvePostSeo", () => {
  test("no SEO panel: legacy values", () => {
    const r = resolvePostSeo(base);
    expect(r.title).toBe("GrowGen | 给我整 | Hello");
    expect(r.pageTitle).toBe(r.title);
    expect(r.description).toBe("Excerpt");
    expect(r.image).toBe("https://res.cloudinary.com/x/cover.jpg");
    expect(r.canonical).toBe("https://growgen.xyz/2025/02/21/hello/");
    expect(r.noindex).toBe(false);
    expect(r.robots).toBeNull();
  });

  test("an empty panel row changes nothing", () => {
    expect(resolvePostSeo({ ...base, seo: none })).toEqual(resolvePostSeo(base));
  });

  test("panel overrides title, description, image and canonical", () => {
    const r = resolvePostSeo({
      ...base,
      seo: {
        title: "Custom title",
        description: "Custom description",
        image: "https://img.example/og.png",
        canonical: "https://example.org/original/",
        noIndex: false,
      },
    });
    expect(r.title).toBe("Custom title");
    expect(r.pageTitle).toBe("Custom title");
    expect(r.description).toBe("Custom description");
    expect(r.image).toBe("https://img.example/og.png");
    expect(r.canonical).toBe("https://example.org/original/");
    expect(r.noindex).toBe(false);
  });

  test("noIndex true is reported; noIndex false never asks for indexing", () => {
    const r = resolvePostSeo({ ...base, seo: { ...none, noIndex: true } });
    expect(r.noindex).toBe(true);
    expect(r.robots).toBe("noindex, nofollow");
    expect(resolvePostSeo({ ...base, seo: { ...none, title: "t", noIndex: false } }).noindex).toBe(false);
  });
});

describe("rowToSeo", () => {
  test("maps columns, trims empties to null, accepts 0/1/boolean", () => {
    expect(
      rowToSeo({ content_id: "x", seo_title: " ", seo_description: "d", seo_image: null, seo_canonical: "", seo_no_index: 1 }),
    ).toEqual({ title: null, description: "d", image: null, canonical: null, noIndex: true });
    expect(rowToSeo({ content_id: "x", seo_title: null, seo_description: null, seo_image: null, seo_canonical: null, seo_no_index: 0 }).noIndex).toBe(false);
    expect(rowToSeo({ content_id: "x", seo_title: null, seo_description: null, seo_image: null, seo_canonical: null, seo_no_index: true }).noIndex).toBe(true);
  });

  test("hasSeoOverride", () => {
    expect(hasSeoOverride(none)).toBe(false);
    expect(hasSeoOverride(undefined)).toBe(false);
    expect(hasSeoOverride({ ...none, noIndex: true })).toBe(true);
  });
});

describe("sitemap noindex filter", () => {
  const ids = new Set(["2025/02/21/hello"]);
  test("matches the post by its /YYYY/MM/DD/slug path, with or without trailing slash", () => {
    expect(isNoindexedPage("https://growgen.xyz/2025/02/21/hello/", ids)).toBe(true);
    expect(isNoindexedPage("https://growgen.xyz/2025/02/21/hello", ids)).toBe(true);
    // the retired /<category>/ form is a 301 and never in the sitemap
    expect(isNoindexedPage("https://growgen.xyz/fe/2025/02/21/hello/", ids)).toBe(false);
  });
  test("does not match other posts or listing pages", () => {
    expect(isNoindexedPage("https://growgen.xyz/2025/02/21/hello-2/", ids)).toBe(false);
    expect(isNoindexedPage("https://growgen.xyz/fe/", ids)).toBe(false);
    expect(isNoindexedPage("https://growgen.xyz/2025/02/21/hello/", new Set())).toBe(false);
  });
});

describe("articleModifiedTime", () => {
  const post = { date: "2025-02-21", publishedAt: "2026-11-24T16:30:23.000Z" };
  test("import-time updated_at (same day) falls back to the legacy date", () => {
    expect(articleModifiedTime({ ...post, updatedAt: "2026-11-24T16:36:16.974Z" })).toBe("2025-02-21");
  });
  test("an edit more than a day after publishing is a real modification", () => {
    expect(articleModifiedTime({ ...post, updatedAt: "2026-12-01T10:00:00.000Z" })).toBe("2026-12-01T10:00:00.000Z");
  });
  test("missing timestamps fall back to the legacy date", () => {
    expect(articleModifiedTime({ date: "2025-02-21" })).toBe("2025-02-21");
    expect(articleModifiedTime({ date: "2025-02-21", updatedAt: "2026-12-01T00:00:00Z" })).toBe("2025-02-21");
  });
});

describe("loadSeoByContentId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearSeoCache();
    mockExecute.mockReset();
  });
  const row = { content_id: "U1", seo_title: "T", seo_description: null, seo_image: null, seo_canonical: null, seo_no_index: 1 };

  test("keys rows by content id and drops empty rows", async () => {
    mockExecute.mockResolvedValue([row, { ...row, content_id: "U2", seo_title: null, seo_no_index: 0 }]);
    const m = await loadSeoByContentId("posts");
    expect([...m.keys()]).toEqual(["U1"]);
  });

  test("a missing _emdash_seo table (Postgres 42P01 / message) is an empty map", async () => {
    mockExecute.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "42P01" }));
    expect((await loadSeoByContentId("posts")).size).toBe(0);
    mockExecute.mockRejectedValueOnce(new Error('Relation "_emdash_seo" Does Not Exist'));
    expect((await loadSeoByContentId("posts")).size).toBe(0);
    expect(isMissingTableError(new Error("no such table: _emdash_seo"))).toBe(true);
    expect(isMissingTableError(new Error("connection refused"))).toBe(false);
  });

  test("other errors propagate and a rejected promise is evicted from the cache", async () => {
    vi.stubEnv("DEV", false);
    mockExecute.mockRejectedValueOnce(new Error("connection refused"));
    await expect(loadSeoByContentId("posts")).rejects.toThrow("connection refused");
    mockExecute.mockResolvedValueOnce([row]);
    expect((await loadSeoByContentId("posts")).size).toBe(1);
  });

  test("memoises outside dev, never in dev", async () => {
    vi.stubEnv("DEV", false);
    mockExecute.mockResolvedValue([row]);
    await loadSeoByContentId("posts");
    await loadSeoByContentId("posts");
    expect(mockExecute).toHaveBeenCalledTimes(1);
    clearSeoCache();
    mockExecute.mockClear();
    vi.stubEnv("DEV", true);
    await loadSeoByContentId("posts");
    await loadSeoByContentId("posts");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe("readNoindexIds", () => {
  const dir = mkdtempSync(join(tmpdir(), "noindex-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  test("reads the list into a Set", () => {
    const f = join(dir, "ok.json");
    writeFileSync(f, JSON.stringify({ legacyIds: ["2025/02/21/hello", 3] }));
    expect([...readNoindexIds(f)]).toEqual(["2025/02/21/hello"]);
  });
  test("warns and returns an empty set when missing or corrupt", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(readNoindexIds(join(dir, "nope.json")).size).toBe(0);
    const f = join(dir, "bad.json");
    writeFileSync(f, "{not json");
    expect(readNoindexIds(f).size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).toContain("missing");
    expect(String(warn.mock.calls[1]![0])).toContain("corrupt");
    warn.mockRestore();
  });
});
