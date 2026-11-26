import { describe, expect, test, vi } from "vitest";
import { hasSeoOverride, resolvePostSeo, rowToSeo, type ContentSeo } from "./seo";
import { isNoindexedPage } from "../../scripts/seo/noindex-list.mjs";

vi.mock("emdash/runtime", () => ({ getDb: vi.fn() }));

const base = {
  title: "Hello",
  description: "Excerpt",
  image: "https://res.cloudinary.com/x/cover.jpg",
  siteUrl: "https://growgen.xyz",
  path: "/fe/2025/02/21/hello/",
};
const none: ContentSeo = { title: null, description: null, image: null, canonical: null, noIndex: false };

describe("resolvePostSeo", () => {
  test("no SEO panel: legacy values", () => {
    const r = resolvePostSeo(base);
    expect(r.title).toBe("GrowGen | 给我整 | Hello");
    expect(r.pageTitle).toBe(r.title);
    expect(r.description).toBe("Excerpt");
    expect(r.image).toBe("https://res.cloudinary.com/x/cover.jpg");
    expect(r.canonical).toBe("https://growgen.xyz/fe/2025/02/21/hello/");
    expect(r.noindex).toBe(false);
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
    expect(resolvePostSeo({ ...base, seo: { ...none, noIndex: true } }).noindex).toBe(true);
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
  const ids = ["2025/02/21/hello"];
  test("matches the post under any category, with or without trailing slash", () => {
    expect(isNoindexedPage("https://growgen.xyz/fe/2025/02/21/hello/", ids)).toBe(true);
    expect(isNoindexedPage("https://growgen.xyz/life/2025/02/21/hello", ids)).toBe(true);
  });
  test("does not match other posts or listing pages", () => {
    expect(isNoindexedPage("https://growgen.xyz/fe/2025/02/21/hello-2/", ids)).toBe(false);
    expect(isNoindexedPage("https://growgen.xyz/fe/", ids)).toBe(false);
    expect(isNoindexedPage("https://growgen.xyz/fe/2025/02/21/hello/", [])).toBe(false);
  });
});
