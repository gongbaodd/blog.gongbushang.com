import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { $latest, $totalCounts, requestLatestPosts } from "./latest";

describe("requestLatestPosts", () => {
  const mockPosts = [
    {
      id: "blog/2024/post-a",
      href: "/blog/2024/post-a",
      title: "Post A",
      date: new Date("2024-01-15"),
      data: { category: "blog", layout: "md", bgClass: "", bgColor: "", titleColor: "", trace: "" },
      excerpt: "Excerpt A",
    },
  ];

  beforeEach(() => {
    const mockResponse = {
      json: () => Promise.resolve({ posts: mockPosts, totalCounts: 5 }),
    };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockResponse)));
    $latest.set([]);
    $totalCounts.set(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sets $latest and $totalCounts from API response", async () => {
    await requestLatestPosts();
    expect($latest.get()).toEqual(mockPosts);
    expect($totalCounts.get()).toBe(5);
  });

  test("calls fetch with correct url", async () => {
    await requestLatestPosts();
    expect(fetch).toHaveBeenCalledWith("/api/cards/latest.json");
  });

  test("overwrites previous store values", async () => {
    $latest.set([{ id: "old" } as never]);
    $totalCounts.set(99);
    await requestLatestPosts();
    expect($latest.get()).toEqual(mockPosts);
    expect($totalCounts.get()).toBe(5);
  });
});
