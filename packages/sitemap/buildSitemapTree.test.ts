import { describe, expect, test } from "vitest";
import { buildSitemapTree } from "./buildSitemapTree";

const posts = [
  { category: "tech", year: "2020" },
  { category: "tech", year: "2020" },
  { category: "tech", year: "2019" },
  { category: "life", year: "2019" },
  { category: "fe", year: "2021" },
  { category: "fe", year: "2021" },
  { category: "fe", year: "2018" },
];

describe("buildSitemapTree", () => {
  test("empty input yields an empty tree", () => {
    expect(buildSitemapTree([])).toEqual({ name: "GrowGen", value: 0, children: [] });
  });

  test("root total equals the number of posts", () => {
    expect(buildSitemapTree(posts).value).toBe(posts.length);
  });

  test("category and year totals add up at every level", () => {
    const tree = buildSitemapTree(posts);
    expect(tree.children.reduce((sum, c) => sum + c.value, 0)).toBe(tree.value);
    for (const category of tree.children) {
      expect(category.children.reduce((sum, y) => sum + y.value, 0)).toBe(category.value);
    }
  });

  test("categories are ordered by count, then name", () => {
    const names = buildSitemapTree(posts).children.map((c) => c.name);
    // tech and fe both have 3 posts, so they sort by name: fe before tech; life has 1.
    expect(names).toEqual(["fe", "tech", "life"]);
  });

  test("years are newest first", () => {
    const tech = buildSitemapTree(posts).children.find((c) => c.name === "tech")!;
    expect(tech.children.map((y) => y.name)).toEqual(["2020", "2019"]);
  });

  test("links point at the category list and the year list", () => {
    const tech = buildSitemapTree(posts).children.find((c) => c.name === "tech")!;
    expect(tech.href).toBe("/tech");
    expect(tech.children[0]).toMatchObject({ category: "tech", href: "/year/2020", value: 2 });
  });

  test("year nodes share the colour index of their category", () => {
    const tree = buildSitemapTree(posts);
    tree.children.forEach((category, index) => {
      for (const year of category.children) expect(year.colorIndex).toBe(index);
    });
  });
});
