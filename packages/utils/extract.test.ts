import { describe, expect, test, vi } from "vitest";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  render: vi.fn(),
}));

vi.mock("./badges", () => ({
  getSeries: vi.fn().mockResolvedValue([]),
}));

vi.mock("../consts", () => ({
  BLOG_SOURCE: "blog",
}));

import { date, tags, category } from "./extract";

type PostLike = {
  id: string;
  data: {
    category?: string;
    tag?: string[];
    date?: Date;
    series?: { slug: string; name?: string };
  };
};

describe("date", () => {
  test("returns data.date for synthetic post", () => {
    const d = new Date("2024-06-15T12:00:00Z");
    const post: PostLike = {
      id: "2024/01/01/ignored",
      data: { date: d },
    };
    expect(date(post as never)).toEqual(d);
  });

  test("parses id path YYYY/MM/DD/slug when no data.date", () => {
    const post: PostLike = {
      id: "2024/01/15/my-slug",
      data: {},
    };
    const result = date(post as never);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });

  test("falls back to id parsing when data.date is invalid (NaN)", () => {
    const post: PostLike = {
      id: "2023/06/01/other",
      data: { date: new Date(NaN) },
    };
    const result = date(post as never);
    expect(result.getFullYear()).toBe(2023);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(1);
  });
});

describe("tags", () => {
  test("returns empty array when tag is missing", () => {
    const post: PostLike = { id: "x", data: {} };
    expect(tags(post as never)).toEqual([]);
  });

  test("returns single tag with label and href", () => {
    const post: PostLike = { id: "x", data: { tag: ["JavaScript"] } };
    expect(tags(post as never)).toEqual([
      { label: "javascript", href: "/tag/javascript" },
    ]);
  });

  test("returns multiple tags lowercased", () => {
    const post: PostLike = { id: "x", data: { tag: ["React", "TypeScript"] } };
    expect(tags(post as never)).toEqual([
      { label: "react", href: "/tag/react" },
      { label: "typescript", href: "/tag/typescript" },
    ]);
  });
});

describe("category", () => {
  test("returns label and href from category", () => {
    const post: PostLike = { id: "x", data: { category: "blog" } };
    expect(category(post as never)).toEqual({
      label: "blog",
      href: "/blog",
    });
  });
});
