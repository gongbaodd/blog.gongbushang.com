import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const samplePosts = [
  {
    id: "blog/2024/a",
    href: "/blog/2024/a",
    title: "Post A",
    date: "2024-01-15",
    umap2D: [0.1, 0.2] as [number, number],
  },
  {
    id: "blog/2024/b",
    href: "/blog/2024/b",
    title: "Post B",
    date: "2024-02-20",
    umap2D: [-0.3, 0.5] as [number, number],
  },
];

function resetStore() {
  $umapPosts.set([]);
  $umapLoading.set(false);
  $umapError.set(null);
}

import {
  $umapChartData,
  $umapError,
  $umapLoading,
  $umapPosts,
  buildUmapChartData,
  requestUmapData,
} from "./umap";

describe("buildUmapChartData", () => {
  test("maps umap2D to x/y and preserves metadata", () => {
    const result = buildUmapChartData(samplePosts);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Posts");
    expect(result[0].data).toHaveLength(2);
    expect(result[0].data[0]).toEqual({
      x: 0.1,
      y: 0.2,
      title: "Post A",
      href: "/blog/2024/a",
      date: "2024-01-15",
    });
    expect(result[0].data[1]).toEqual({
      x: -0.3,
      y: 0.5,
      title: "Post B",
      href: "/blog/2024/b",
      date: "2024-02-20",
    });
  });

  test("returns single series with empty data for empty input", () => {
    const result = buildUmapChartData([]);

    expect(result).toHaveLength(1);
    expect(result[0].data).toEqual([]);
  });
});

describe("$umapChartData", () => {
  beforeEach(resetStore);

  test("reflects current posts", () => {
    $umapPosts.set(samplePosts);
    expect($umapChartData.get()[0].data).toHaveLength(2);
  });
});

describe("requestUmapData", () => {
  beforeEach(() => {
    resetStore();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ posts: samplePosts }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("populates posts on success", async () => {
    await requestUmapData();

    expect($umapPosts.get()).toEqual(samplePosts);
    expect($umapLoading.get()).toBe(false);
    expect($umapError.get()).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/posts/umap.json");
  });

  test("sets error on HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    } as Response);

    await requestUmapData();

    expect($umapPosts.get()).toEqual([]);
    expect($umapError.get()).toBe("Not Found");
    expect($umapLoading.get()).toBe(false);
  });

  test("sets error on network throw", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await requestUmapData();

    expect($umapPosts.get()).toEqual([]);
    expect($umapError.get()).toBe("network down");
    expect($umapLoading.get()).toBe(false);
  });
});
