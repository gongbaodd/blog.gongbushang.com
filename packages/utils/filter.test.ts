import { describe, expect, test, vi } from "vitest";

vi.mock("astro:content", () => ({
  getCollection: vi.fn().mockResolvedValue([]),
  getEntry: vi.fn(),
  render: vi.fn(),
}));

vi.mock("../consts", () => ({
  BLOG_SOURCE: "blog",
  FILTER_ENTRY: {
    ALL: "all",
    TAG: "tag",
    SERIES: "series",
    YEAR: "year",
    WORLD: "world",
  },
  POST_COUNT_PER_PAGE: 16,
  POST_CARD_LAYOUT: { xs: "xs", sm: "sm", md: "md", lg: "lg", xl: "xl" },
  POST_CARD_CLASSNAMES: ["a", "b", "c"],
}));

vi.mock("./badges", () => ({
  getSeries: vi.fn().mockResolvedValue([]),
}));

vi.mock("./podcast", () => ({
  mapPodcastEpisodesToPosts: () => [],
}));

import { createPostMap, sortPostsByDate } from "./filter";

type PostLike = {
  id: string;
  data: { category?: string; tag?: string[]; date?: Date };
};

function post(id: string, data: PostLike["data"]): PostLike {
  return { id, data };
}

describe("createPostMap", () => {
  test("groups posts by category", () => {
    const posts = [
      post("2024/01/01/a", { category: "blog" }),
      post("2024/01/02/b", { category: "lab" }),
      post("2024/01/03/c", { category: "blog" }),
    ];
    const map = createPostMap(posts as never, (p) => [p.data.category].filter(Boolean) as string[]);
    expect(map.size).toBe(2);
    expect(map.get("blog")?.size).toBe(2);
    expect(map.get("lab")?.size).toBe(1);
  });

  test("one post can appear in multiple keys (e.g. tags)", () => {
    const posts = [
      post("2024/01/01/a", { tag: ["react", "typescript"] }),
      post("2024/01/02/b", { tag: ["react"] }),
    ];
    const map = createPostMap(posts as never, (p) =>
      (p.data.tag ?? []).map((t: string) => t.toLowerCase())
    );
    expect(map.get("react")?.size).toBe(2);
    expect(map.get("typescript")?.size).toBe(1);
  });

  test("works with Set input", () => {
    const posts = new Set([
      post("2024/01/01/a", { category: "blog" }),
      post("2024/01/02/b", { category: "blog" }),
    ] as never[]);
    const map = createPostMap(posts, (p) => [p.data.category].filter(Boolean) as string[]);
    expect(map.get("blog")?.size).toBe(2);
  });
});

describe("sortPostsByDate", () => {
  test("sorts posts descending by date from id path", () => {
    const posts = [
      post("2023/06/01/older", {}),
      post("2024/01/15/newer", {}),
    ];
    const result = sortPostsByDate(posts as never);
    expect(result[0].id).toBe("2024/01/15/newer");
    expect(result[1].id).toBe("2023/06/01/older");
  });

  test("sorts by data.date when present (synthetic post)", () => {
    const posts = [
      post("2024/01/01/a", { date: new Date("2024-12-25") }),
      post("2024/06/01/b", {}),
    ];
    const result = sortPostsByDate(posts as never);
    expect(result[0].data.date).toEqual(new Date("2024-12-25"));
    expect(result[0].id).toBe("2024/01/01/a");
  });
});
