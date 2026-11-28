import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assertUniquePostUrls, isValidPostSlug, POST_URL_TZ, postUrlDate, resolvePostId } from "./post-id";
import { parsePostPath, parseRetiredPostPath, postParams } from "./legacy-url";
import { mapPost } from "./content";
import { LEGACY_TZ } from "./listing-core";

const cat = { category: [{ slug: "fe", label: "fe" }] };
const entry = (id: string, data: Record<string, unknown>) => ({ id, data: { terms: cat, ...data } }) as Parameters<typeof mapPost>[0];

describe("new post URL date (published_at in one named timezone)", () => {
  it("uses Europe/Tallinn, the legacy site timezone", () => {
    expect(POST_URL_TZ).toBe("Europe/Tallinn");
    expect(LEGACY_TZ).toBe(POST_URL_TZ);
  });

  it("formats the calendar date in that zone, across the midnight-UTC boundary", () => {
    // Summer (UTC+3): 21:00Z is already the next day in Tallinn, 20:59Z is not.
    expect(postUrlDate("2026-07-14T21:30:00.000Z")).toBe("2026/07/15");
    expect(postUrlDate("2026-07-14T20:59:59.000Z")).toBe("2026/07/14");
    // Winter (UTC+2): 22:00Z is the next day, 21:59Z is not.
    expect(postUrlDate("2026-12-31T22:00:00.000Z")).toBe("2027/01/01");
    expect(postUrlDate("2026-12-31T21:59:59.000Z")).toBe("2026/12/31");
    expect(postUrlDate(new Date("2026-03-01T00:00:00Z"))).toBe("2026/03/01");
  });

  it("is undefined for a missing or invalid date", () => {
    for (const v of [null, undefined, "", "nope"]) expect(postUrlDate(v)).toBeUndefined();
  });
});

describe("mapPost for posts created in the admin", () => {
  it("builds /YYYY/MM/DD/<slug>/ from published_at and the entry slug", () => {
    const p = mapPost(entry("my-new-post", { publishedAt: "2026-07-14T21:30:00.000Z", legacy_date: "1999-01-01" }))!;
    expect(p.id).toBe("2026/07/15/my-new-post");
    expect(p.href).toBe("/2026/07/15/my-new-post/");
    expect(p.viewPath).toBe("/2026/07/15/my-new-post");
    expect(p.params).toEqual({ year: "2026", month: "07", day: "15", slug: "my-new-post" });
    expect(p.date).toBe("2026-07-15");
    expect(parsePostPath(p.href)).toEqual({ legacyId: p.id });
    expect(postParams(p.id)).toEqual(p.params);
  });

  it("keeps the exact URL of an imported post, whatever published_at says", () => {
    const p = mapPost(entry("2015-03-15-threejs", { legacy_id: "2015/03/15/threejs", legacy_date: "2015-03-15", publishedAt: "2026-11-27T10:00:00Z" }))!;
    expect(p.id).toBe("2015/03/15/threejs");
    expect(p.href).toBe("/2015/03/15/threejs/");
    expect(p.viewPath).toBe("/fe/2015/03/15/threejs");
    expect(p.date).toBe("2015-03-15");
  });

  it("excludes an entry that was never published (no published_at)", () => {
    expect(mapPost(entry("draft-post", {}))).toBeUndefined();
    expect(mapPost(entry("draft-post", { publishedAt: null }))).toBeUndefined();
  });

  it("accepts a post without a category (GON-270): same URL, no category, no throw", () => {
    const fresh = mapPost({ id: "x", data: { publishedAt: new Date("2026-07-14T10:00:00Z"), terms: null } })!;
    expect(fresh.href).toBe("/2026/07/14/x/");
    expect(fresh.data.category).toBeUndefined();
    expect("category" in fresh.data).toBe(false);
    const imported = mapPost({ id: "x", data: { legacy_id: "2024/01/01/ok", terms: null } })!;
    expect(imported.href).toBe("/2024/01/01/ok/");
    expect(imported.viewPath).toBe("/2024/01/01/ok");
  });

  it("throws on a slug that is not one path segment", () => {
    expect(() => mapPost(entry("a/b", { publishedAt: "2026-07-14T10:00:00Z" }))).toThrow(/invalid slug/);
    expect(() => mapPost(entry("Upper", { publishedAt: "2026-07-14T10:00:00Z" }))).toThrow(/invalid slug/);
  });
});

describe("slug rule", () => {
  it("accepts every one of the 995 imported slugs (YYYY-MM-DD-<slug>)", () => {
    const urls = readFileSync(new URL("../../tests/legacy-urls.txt", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"));
    let n = 0;
    for (const u of urls) {
      const p = parseRetiredPostPath(u);
      if (!p) continue;
      n++;
      expect(isValidPostSlug(p.legacyId.replaceAll("/", "-")), u).toBe(true);
    }
    expect(n).toBe(995);
  });

  it("rejects slashes, uppercase, spaces and empty", () => {
    for (const s of ["a/b", "A", "a b", "", "-a", "a.b", "a_b", null]) expect(isValidPostSlug(s), String(s)).toBe(false);
  });
});

describe("resolvePostId (derive and seo scripts)", () => {
  it("prefers legacy_id, else builds the synthetic id, else undefined", () => {
    expect(resolvePostId({ legacyId: "2015/03/15/threejs", slug: "2015-03-15-threejs", publishedAt: "2026-01-01T00:00:00Z" })).toBe("2015/03/15/threejs");
    expect(resolvePostId({ legacyId: null, slug: "new-one", publishedAt: "2026-07-14T21:30:00Z" })).toBe("2026/07/15/new-one");
    expect(resolvePostId({ legacyId: null, slug: "new-one", publishedAt: null })).toBeUndefined();
  });
});

describe("duplicate URLs fail the build", () => {
  it("passes distinct urls", () => {
    expect(() =>
      assertUniquePostUrls([
        { key: "/fe/2026/07/15/a/", entry: "a" },
        { key: "/fe/2026/07/15/b/", entry: "b" },
      ]),
    ).not.toThrow();
  });

  it("names the clashing path and both posts", () => {
    expect(() =>
      assertUniquePostUrls([
        { key: "/fe/2026/07/15/a/", entry: "one" },
        { key: "/fe/2026/07/15/a/", entry: "two" },
      ]),
    ).toThrow(/duplicate post URL: \/fe\/2026\/07\/15\/a\/ \(posts "one" and "two"\)/);
  });

  it("getAllPosts rejects a new post that collides with an imported post's id, even in another category", async () => {
    vi.resetModules();
    vi.doMock("emdash", () => ({
      getEmDashCollection: async () => ({
        entries: [
          { id: "clash", data: { terms: cat, publishedAt: "2026-07-15T08:00:00Z" } },
          { id: "other", data: { terms: { category: [{ slug: "life", label: "life" }] }, legacy_id: "2026/07/15/clash" } },
        ],
      }),
      getEmDashEntry: async () => ({}),
    }));
    vi.doMock("./seo", () => ({ loadSeoByContentId: async () => new Map() }));
    const { getAllPosts } = await import("./content");
    await expect(getAllPosts()).rejects.toThrow(/duplicate post id: 2026\/07\/15\/clash/);
    vi.doUnmock("emdash");
    vi.doUnmock("./seo");
  });
});
