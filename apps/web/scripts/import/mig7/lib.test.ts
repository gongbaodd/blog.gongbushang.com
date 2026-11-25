import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM helper
import {
  checkGalleryImages,
  checkPostImages,
  galleryLegacyId,
  gallerySlug,
  globLegacyId,
  importableGallery,
  importablePosts,
  parseContentDiff,
  slugifySegment,
} from "./lib.mjs";

describe("parseContentDiff", () => {
  const diff = [
    "A\t_docs/2026/11/25/gameplay-atlas.md",
    "M\t_docs/2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md",
    "D\t_docs/2020/01/01/gone.md",
    "R095\t_docs/2021/01/01/old.md\t_docs/2021/01/02/new.mdx",
    "A\t_gallery/11/25/beijing.json",
    "M\t_gallery/02/03/dalian.json",
    "D\t_gallery/01/01/old.json",
    "A\tgenerated/gallery.json",
    "M\tgenerated/metadata/.umap-state.json",
  ].join("\n");

  const parsed = parseContentDiff(diff);

  it("classifies both posts and gallery items while ignoring generated files", () => {
    expect(parsed.posts.added.map((r: any) => r.path)).toEqual(["2026/11/25/gameplay-atlas.md"]);
    expect(parsed.posts.modified.map((r: any) => r.path)).toEqual([
      "2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md",
    ]);
    expect(parsed.posts.deleted.map((r: any) => r.path)).toEqual(["2020/01/01/gone.md"]);
    expect(parsed.posts.renamed).toEqual([
      { status: "renamed", path: "2021/01/02/new.mdx", from: "2021/01/01/old.md" },
    ]);

    expect(parsed.gallery.added.map((r: any) => r.path)).toEqual(["11/25/beijing.json"]);
    expect(parsed.gallery.modified.map((r: any) => r.path)).toEqual(["02/03/dalian.json"]);
    expect(parsed.gallery.deleted.map((r: any) => r.path)).toEqual(["01/01/old.json"]);
  });

  it("computes importable lists excluding deleted items", () => {
    expect(importablePosts(parsed.posts)).toEqual([
      "2026/11/25/gameplay-atlas.md",
      "2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md",
      "2021/01/02/new.mdx",
    ]);
    expect(importableGallery(parsed.gallery)).toEqual(["11/25/beijing.json", "02/03/dalian.json"]);
  });
});

describe("globLegacyId & gallery helpers", () => {
  it("matches Astro github-slugger rules for mixed-case and punctuated filenames", () => {
    expect(globLegacyId("2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md")).toBe(
      "2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show",
    );
    expect(globLegacyId("2026/11/25/gameplay-atlas.md")).toBe("2026/11/25/gameplay-atlas");
    expect(globLegacyId("2024/03/30/week-13-3-body-Steroids.md")).toBe("2024/03/30/week-13-3-body-steroids");
    expect(globLegacyId("2020/01/01/My Folder/index.mdx")).toBe("2020/01/01/my-folder");
    expect(slugifySegment("中文-标题 (2026)")).toBe("中文-标题-2026");
  });

  it("derives gallery legacy_id and slug", () => {
    expect(galleryLegacyId("11/25/beijing.json")).toBe("11/25/beijing");
    expect(gallerySlug("11/25/beijing")).toBe("11-25-beijing");
  });
});

describe("checkPostImages (MIG-2 rewrite-map aware)", () => {
  const cldCover =
    "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796";
  const sinaUrl = "http://ww1.sinaimg.cn/mw690/89d0a2e1ly1flvkk8i2ppj23vc2kw1l5.jpg";
  const pid = "growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796";
  const mappedUrl = `https://res.cloudinary.com/dmq8ipket/image/upload/${pid}`;
  const path = "2017/11/25/It's-not-a-particularly-worthwhile-Qin-and-Han-show.md";

  const postText = `---\ncover:\n  url: ${cldCover}\n  alt: guanyin\n---\n# Title\n![](${sinaUrl})\n`;

  it("passes when external body URLs are already uploaded in MIG-2", () => {
    const res = checkPostImages([{ path, text: postText }], {
      rewriteMap: { posts: { [path]: { [sinaUrl]: mappedUrl } } },
      uploadResult: { [pid]: { status: "uploaded" } },
    });
    expect(res.unhosted).toEqual([]);
    expect(res.cloudinaryDirect).toBe(1);
    expect(res.rewrittenByMap).toEqual([{ path, url: sinaUrl, cloudinaryUrl: mappedUrl, publicId: pid }]);
  });

  it("blocks when an external URL is mapped but not yet uploaded", () => {
    const res = checkPostImages([{ path, text: postText }], {
      rewriteMap: { posts: { [path]: { [sinaUrl]: mappedUrl } } },
      uploadResult: { [pid]: { status: "failed" } },
    });
    expect(res.unhosted).toEqual([
      { path, url: sinaUrl, reason: "mapped-but-not-uploaded", publicId: pid },
    ]);
  });

  it("blocks brand-new external or local images not in rewrite-map", () => {
    const res = checkPostImages(
      [{ path: "2026/11/26/new.md", text: "---\n---\n![](https://example.com/a.jpg)\n![]( ./local.png )\n" }],
      { rewriteMap: { posts: {} }, uploadResult: {} },
    );
    expect(res.unhosted.map((u: any) => u.url).sort()).toEqual(["./local.png", "https://example.com/a.jpg"]);
    expect(res.unhosted.every((u: any) => u.reason === "not-on-cloudinary")).toBe(true);
  });
});

describe("checkGalleryImages", () => {
  it("accepts Cloudinary gallery items and rejects external or missing URLs", () => {
    expect(
      checkGalleryImages([
        {
          path: "11/25/beijing.json",
          data: {
            image:
              "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show/4032ccf24796",
            doc: "/2017/11/25/its-not-a-particularly-worthwhile-qin-and-han-show",
          },
        },
      ]),
    ).toEqual([]);

    expect(
      checkGalleryImages([
        { path: "11/26/ext.json", data: { image: "https://example.com/pic.jpg", doc: "/x" } },
        { path: "11/27/empty.json", data: { doc: "/y" } },
      ]),
    ).toEqual([
      { path: "11/26/ext.json", url: "https://example.com/pic.jpg" },
      { path: "11/27/empty.json", url: "(missing)" },
    ]);
  });
});
