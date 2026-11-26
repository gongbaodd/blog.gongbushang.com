import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM helper
import {
  bumpPreconditions,
  checkGalleryImages,
  describeTarget,
  validateOptions,
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

describe("describeTarget", () => {
  it("treats localhost, 127.0.0.1 and [::1] as loopback", () => {
    expect(describeTarget("http://127.0.0.1:4322")).toEqual({ ok: true, host: "127.0.0.1:4322", loopback: true });
    expect(describeTarget("http://localhost:4333/").loopback).toBe(true);
    expect(describeTarget("http://[::1]:4322").loopback).toBe(true);
  });

  it("treats every other host as remote, including look-alikes", () => {
    expect(describeTarget("https://admin.growgen.xyz")).toEqual({ ok: true, host: "admin.growgen.xyz", loopback: false });
    expect(describeTarget("http://127.0.0.1.nip.io:4322").loopback).toBe(false);
    expect(describeTarget("http://localhost.evil.com").loopback).toBe(false);
    expect(describeTarget("http://10.0.0.5:4322").loopback).toBe(false);
  });

  it("rejects userinfo, non-http schemes and garbage", () => {
    expect(describeTarget("http://localhost:80@evil.com").ok).toBe(false);
    expect(describeTarget("ftp://127.0.0.1").ok).toBe(false);
    expect(describeTarget("not a url").ok).toBe(false);
    expect(describeTarget(undefined).ok).toBe(false);
  });
});

describe("validateOptions", () => {
  const local = "http://127.0.0.1:4322";
  const remote = "https://admin.growgen.xyz";

  it("dry-run needs neither --rewrite nor --url", () => {
    expect(validateOptions({ write: false })).toEqual([]);
    expect(validateOptions({ write: false, rewrite: "map" })).toEqual([]);
  });

  it("rejects an unknown --rewrite value even in dry-run", () => {
    expect(validateOptions({ write: false, rewrite: "all" })).toEqual(["--rewrite must be map or none (got all)"]);
  });

  it("--write requires an explicit --rewrite", () => {
    const errs = validateOptions({ write: true, url: local });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/explicit --rewrite/);
    expect(validateOptions({ write: true, url: local, rewrite: "none" })).toEqual([]);
    expect(validateOptions({ write: true, url: local, rewrite: "map" })).toEqual([]);
  });

  it("--write requires a valid --url", () => {
    expect(validateOptions({ write: true, rewrite: "none" })[0]).toMatch(/needs --url/);
    expect(validateOptions({ write: true, rewrite: "none", url: "http://u:p@127.0.0.1" })[0]).toMatch(/userinfo/);
  });

  it("--write to a non-loopback admin refuses without --yes-production", () => {
    expect(validateOptions({ write: true, rewrite: "map", url: remote })).toEqual([
      "refusing to write to non-loopback admin admin.growgen.xyz without --yes-production",
    ]);
    expect(validateOptions({ write: true, rewrite: "map", url: remote, yesProduction: true })).toEqual([]);
  });

  it("--bump needs --write", () => {
    expect(validateOptions({ write: false, bump: true })[0]).toMatch(/--bump needs --write/);
  });
});

describe("bumpPreconditions", () => {
  const base = "4893092b7beb40e7edf6b68205f8e649d18226a2";
  const target = "697380543aa357574a7c430ed952adf4a1ed0bda";
  const other = "b7d0c046ee9732791a4786ec24104e1e2367fe54";

  it("passes when gitlink and checkout are at base and clean", () => {
    expect(bumpPreconditions({ headGitlink: base, subHead: base, base, target })).toEqual({ errors: [], noop: false });
  });

  it("is a no-op when both are already at target", () => {
    expect(bumpPreconditions({ headGitlink: target, subHead: target, base, target })).toEqual({ errors: [], noop: true });
  });

  it("refuses when the gitlink is not at base", () => {
    const r = bumpPreconditions({ headGitlink: other, subHead: base, base, target });
    expect(r.noop).toBe(false);
    expect(r.errors).toEqual([expect.stringMatching(/^HEAD:src\/content is b7d0c046, not --base 4893092b/)]);
  });

  it("refuses when the checkout is elsewhere or dirty", () => {
    const r = bumpPreconditions({ headGitlink: base, subHead: target, subDirty: true, base, target });
    expect(r.errors).toEqual([
      "src/content is checked out at 69738054, not --base 4893092b",
      "src/content has uncommitted changes",
    ]);
    expect(bumpPreconditions({ headGitlink: target, subHead: target, subDirty: true, base, target }).noop).toBe(false);
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
