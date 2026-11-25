import { describe, expect, test } from "vitest";
import { getCategoryColor, getPostYear } from "./postsData";

describe("getCategoryColor", () => {
  test("returns podcast palette color", () => {
    expect(getCategoryColor("podcast")).toBe("#f72585");
  });
});

describe("getPostYear", () => {
  test("parses RFC podcast pubDate", () => {
    expect(
      getPostYear({
        id: "ep-1",
        href: "/podcast",
        title: "Ep",
        date: "Fri, 10 Apr 2026 11:25:23 GMT",
        category: { label: "podcast" },
        umap2D: [0, 0],
      }),
    ).toBe("2026");
  });
});
