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
  POST_CARD_LAYOUT: { xs: "xs", sm: "sm", md: "md", lg: "lg", xl: "xl" },
  POST_CARD_CLASSNAMES: ["a", "b", "c"],
}));

vi.mock("./badges", () => ({
  getSeries: vi.fn().mockResolvedValue([]),
}));

vi.mock("./podcast", () => ({
  mapPodcastEpisodesToPosts: () => [],
}));

vi.mock("./post", () => ({
  getAllPosts: vi.fn(),
}));

import { getHeatmapData, getCounts } from "./heatmap";
import { getAllPosts } from "./post";

describe("getHeatmapData", () => {
  test("aggregates body length by date key", async () => {
    vi.mocked(getAllPosts).mockResolvedValue([
      { id: "2024/01/15/post-a", data: {}, body: "hello world" },
      { id: "2024/01/15/post-b", data: {}, body: "xyz" },
      { id: "2023/06/01/post-c", data: {}, body: "content" },
    ] as never[]);
    const result = await getHeatmapData();
    expect(result["2024-01-15"]).toBe(11 + 3);
    expect(result["2023-06-01"]).toBe(7);
  });

  test("multiple posts on same day sum counts", async () => {
    vi.mocked(getAllPosts).mockResolvedValue([
      { id: "2024/01/10/a", data: {}, body: "aa" },
      { id: "2024/01/10/b", data: {}, body: "bbb" },
    ] as never[]);
    const result = await getHeatmapData();
    expect(result["2024-01-10"]).toBe(5);
  });
});

describe("getCounts", () => {
  test("returns per-year counts and ALL total", async () => {
    vi.mocked(getAllPosts).mockResolvedValue([
      { id: "2024/01/15/a", data: {} },
      { id: "2024/06/01/b", data: {} },
      { id: "2023/01/01/c", data: {} },
    ] as never[]);
    const result = await getCounts();
    expect(result["2024"]).toBe(2);
    expect(result["2023"]).toBe(1);
    expect(result["all"]).toBe(3);
  });
});
