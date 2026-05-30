import { describe, expect, test } from "vitest";
import {
  applyGalleryEntryToClientPost,
  type GalleryEntry,
} from "./gallery.ts";

const galleryEntry: GalleryEntry = {
  id: "05/25/shenzhen",
  file: "05/25/shenzhen",
  hash: "abc",
  image: "https://example.com/gallery.jpg",
  doc: "/2019/05/25/take-another-black-golden-roof-again",
  colorSet: {
    bgColor: "#6c6d83",
    titleColor: "--mantine-color-green-4",
  },
};

const clientPost = {
  id: "2019/05/25/take-another-black-golden-roof-again",
  href: "/life/2019/05/25/take-another-black-golden-roof-again",
  title: "Gallery post",
  date: new Date("2019-05-25"),
  excerpt: "Excerpt",
  data: {
    category: "life",
    cover: { url: "https://example.com/post.jpg", alt: "post alt" },
    bgColor: "#ae9f74",
    titleColor: "--mantine-color-orange-2",
    trace: "<svg>post</svg>",
    layout: "md",
  },
};

describe("applyGalleryEntryToClientPost", () => {
  test("overrides cover, trace, and colorSet from gallery entry", () => {
    const result = applyGalleryEntryToClientPost(
      clientPost,
      galleryEntry,
      "<svg>gallery</svg>",
    );

    expect(result).toMatchObject({
      id: "2019/05/25/take-another-black-golden-roof-again",
      title: "Gallery post",
      data: {
        cover: {
          url: "https://example.com/gallery.jpg",
          alt: "post alt",
        },
        bgColor: "#6c6d83",
        titleColor: "--mantine-color-green-4",
        trace: "<svg>gallery</svg>",
        category: "life",
        layout: "md",
      },
    });
  });

  test("falls back to title for cover alt", () => {
    const result = applyGalleryEntryToClientPost(
      {
        ...clientPost,
        data: {
          ...clientPost.data,
          cover: { url: "https://example.com/post.jpg" },
        },
      },
      galleryEntry,
    );

    expect(result.data.cover).toEqual({
      url: "https://example.com/gallery.jpg",
      alt: "Gallery post",
    });
  });
});
