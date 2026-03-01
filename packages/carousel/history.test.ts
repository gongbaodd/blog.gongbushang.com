import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { $history, requestHistoryPosts } from "./history";

describe("requestHistoryPosts", () => {
  const mockPosts = [
    {
      id: "blog/2023/old-post",
      href: "/blog/2023/old-post",
      title: "Old Post",
      date: new Date("2023-06-01"),
      data: { category: "blog", layout: "md", bgClass: "", bgColor: "", titleColor: "", trace: "" },
      excerpt: "Old excerpt",
    },
  ];

  beforeEach(() => {
    const mockResponse = {
      json: () => Promise.resolve({ posts: mockPosts }),
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse)));
    $history.set([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sets $history from API response", async () => {
    await requestHistoryPosts();
    expect($history.get()).toEqual(mockPosts);
  });

  test("calls fetch with correct url", async () => {
    await requestHistoryPosts();
    expect(fetch).toHaveBeenCalledWith("/api/cards/history.json");
  });

  test("overwrites previous store value", async () => {
    $history.set([{ id: "previous" } as never]);
    await requestHistoryPosts();
    expect($history.get()).toEqual(mockPosts);
  });
});
