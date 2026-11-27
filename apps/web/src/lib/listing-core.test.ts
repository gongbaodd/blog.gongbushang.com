import { describe, expect, test } from "vitest";
import {
  apiTagHref,
  citySlug,
  dateText,
  layoutFor,
  localMidnight,
  paginate,
  reorderLike,
  sortByDate,
  toClientPost,
  type ListEntry,
} from "./listing-core";

const entry = (over: Partial<ListEntry> = {}): ListEntry => ({
  id: "2026/11/19/x",
  title: "Hello big world",
  date: localMidnight("2026-11-19"),
  data: { category: "fe", tag: ["ai"] },
  ...over,
});

describe("listing-core", () => {
  test("local midnight matches the legacy Tallinn build instants", () => {
    expect(localMidnight("2026-11-19").toISOString()).toBe("2026-11-18T22:00:00.000Z");
    expect(localMidnight("2026-07-01").toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(dateText(localMidnight("2026-03-29"))).toBe("2026-03-29");
  });

  test("client post key order and fields", () => {
    const p = toClientPost(entry(), "ex...");
    expect(Object.keys(p)).toEqual(["id", "href", "title", "date", "dateText", "data", "excerpt"]);
    expect(p.href).toBe("/fe/2026/11/19/x");
    expect(p.dateText).toBe("2026-11-19");
    expect(Object.keys(p.data)).toEqual(["category", "tag", "bgClass", "layout"]);
  });

  test("covered entries take the metadata colors, no bgClass", () => {
    const p = toClientPost(
      entry({
        data: {
          category: "fe",
          cover: { url: "https://res.cloudinary.com/x/image/upload/v1/a.jpg" },
        },
        colorSet: { bgColor: "#111", titleColor: "--c" },
      }),
      "",
    );
    expect(p.data.bgClass).toBeUndefined();
    expect(p.data.bgColor).toBe("#111");
    expect(p.data.cover!.url as string).toContain("f_auto,q_auto");
  });

  test("layout buckets", () => {
    expect(layoutFor("a", 0)).toBe("xs");
    expect(layoutFor("a b c", 1)).toBe("md");
  });

  test("paginate by 16 and keep props", () => {
    const posts = Array.from({ length: 33 }, (_, i) => i);
    const pages = paginate([{ params: { filter: "fe" }, props: { posts, extra: 1 } }]);
    expect(pages.map((p) => p.params.page)).toEqual(["0", "1", "2"]);
    expect(pages[2].props.posts).toEqual([32]);
    expect(pages[0].props.extra).toBe(1);
  });

  test("sort is newest first", () => {
    const a = entry({ id: "a", date: localMidnight("2020-01-01") });
    const b = entry({ id: "b", date: localMidnight("2021-01-01") });
    expect(sortByDate([a, b]).map((e) => e.id)).toEqual(["b", "a"]);
  });

  test("helpers", () => {
    expect(citySlug("Tallinn, Estonia")).toBe("tallinn-estonia");
    expect(apiTagHref("c#")).toBe("/tag/c-sharp");
    expect(apiTagHref("宇宙")).toBe("/tag/宇宙");
    expect(reorderLike(["b", "a"], ["a", "b"])).toEqual(["a", "b"]);
    expect(reorderLike(["b", "a"], ["a", "c"])).toEqual(["b", "a"]);
  });
});
