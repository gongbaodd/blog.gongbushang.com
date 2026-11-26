// GON-224: the post page's left sidebar renders the real cover card from the same client post shape the listings use.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogMenu } from "./BlogContent";
import { toClientPost, type ListEntry } from "../lib/listing-core";

const base: ListEntry = {
  id: "2024/03/05/hello-world",
  title: "Hello world",
  date: new Date("2024-03-05T12:00:00Z"),
  data: { category: "tech", tag: ["a", "b"] },
};

function render(entry: ListEntry) {
  const post = toClientPost(entry, "excerpt");
  return renderToString(createElement(BlogMenu, { post, links: [], headings: [] }));
}

describe("BlogMenu sidebar card", () => {
  it("renders the cover card (title, date, category, link) for a post with a cover", () => {
    const html = render({
      ...base,
      data: { ...base.data, cover: { url: "https://res.cloudinary.com/demo/image/upload/v1/cover.jpg" } },
      colorSet: { bgColor: "#123456", titleColor: "--mantine-color-blue-6" },
    });
    expect(html).toContain("Hello world");
    expect(html).toContain('href="/tech/2024/03/05/hello-world"');
    expect(html).toContain("cover_area");
    expect(html).toContain("cover_footer");
  });

  it("renders the plain card (title, date, category) for a post without a cover", () => {
    const html = render(base);
    expect(html).toContain("Hello world");
    expect(html).toContain("2024-03-05");
    expect(html).toContain("tech");
    expect(html).not.toContain("cover_area");
  });
});
