import { describe, expect, test } from "vitest";
import { optimizeCloudinaryUrl, optimizeCoverUrl, rehypeCloudinary } from "./cloudinary.ts";

describe("optimizeCloudinaryUrl", () => {
  test("inserts f_auto,q_auto into a versioned image URL", () => {
    expect(
      optimizeCloudinaryUrl(
        "https://res.cloudinary.com/dmq8ipket/image/upload/v1789381378/IMG_3641_k4rxbq.jpg",
      ),
    ).toBe(
      "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/v1789381378/IMG_3641_k4rxbq.jpg",
    );
  });

  test("preserves existing transforms and folders", () => {
    expect(
      optimizeCloudinaryUrl(
        "https://res.cloudinary.com/demo/image/upload/a_-90/w_800/folder/IMG_x.jpg",
      ),
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/a_-90/w_800/folder/IMG_x.jpg",
    );
  });

  test("is idempotent for comma-form transforms", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg";
    expect(optimizeCloudinaryUrl(url)).toBe(url);
  });

  test("is idempotent for slash-form transforms", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/f_auto/q_auto/v1/a.jpg";
    expect(optimizeCloudinaryUrl(url)).toBe(url);
  });

  test("does not duplicate partial transforms", () => {
    expect(
      optimizeCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/f_auto/v1/a.jpg"),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/f_auto/v1/a.jpg");
  });

  test("handles video delivery URLs", () => {
    expect(optimizeCloudinaryUrl("https://res.cloudinary.com/demo/video/upload/v1/clip.mp4")).toBe(
      "https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/v1/clip.mp4",
    );
  });

  test("preserves query strings and fragments", () => {
    expect(
      optimizeCloudinaryUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg?foo=bar#frag"),
    ).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg?foo=bar#frag");
  });

  test("leaves non-Cloudinary URLs untouched", () => {
    expect(optimizeCloudinaryUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    expect(optimizeCloudinaryUrl("/local/image.png")).toBe("/local/image.png");
    expect(optimizeCloudinaryUrl("")).toBe("");
  });
});

describe("optimizeCoverUrl", () => {
  test("optimizes string covers", () => {
    expect(optimizeCoverUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg",
    );
  });

  test("optimizes Astro ImageMetadata objects preserving other fields", () => {
    const cover = {
      src: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
      width: 800,
      height: 600,
    };
    expect(optimizeCoverUrl(cover)).toEqual({
      src: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg",
      width: 800,
      height: 600,
    });
  });

  test("returns identical object when already optimized", () => {
    const cover = {
      src: "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg",
    };
    expect(optimizeCoverUrl(cover)).toBe(cover);
  });

  test("passes through non-URL values", () => {
    expect(optimizeCoverUrl(undefined)).toBeUndefined();
    expect(optimizeCoverUrl(null)).toBeNull();
  });
});

describe("rehypeCloudinary", () => {
  test("rewrites img src and leaves other hosts alone", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "img",
          properties: {
            src: "https://res.cloudinary.com/demo/image/upload/v1/a.jpg",
          },
          children: [],
        },
        {
          type: "element",
          tagName: "img",
          properties: { src: "https://example.com/b.jpg" },
          children: [],
        },
      ],
    };
    rehypeCloudinary()(tree);
    expect(tree.children[0]!.properties!.src).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg",
    );
    expect(tree.children[1]!.properties!.src).toBe("https://example.com/b.jpg");
  });

  test("rewrites srcset entries keeping descriptors", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "source",
          properties: {
            srcset:
              "https://res.cloudinary.com/demo/image/upload/v1/a.jpg 480w, https://example.com/b.jpg 800w",
          },
          children: [],
        },
      ],
    };
    rehypeCloudinary()(tree);
    expect(tree.children[0]!.properties!.srcset).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.jpg 480w, https://example.com/b.jpg 800w",
    );
  });
});
