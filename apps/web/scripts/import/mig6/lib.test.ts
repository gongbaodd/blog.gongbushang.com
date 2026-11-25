import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM
import { classify, importable, imageRefs, legacyIdOf, offCloudinary, parseNameStatus } from "./lib.mjs";

describe("parseNameStatus", () => {
  const out = [
    "A\t_docs/2026/11/25/gameplay-atlas.md",
    "M\t_docs/2024/01/01/a.mdx",
    "D\t_docs/2020/01/01/gone.md",
    "R090\t_docs/2021/01/01/old.md\t_docs/2021/01/02/new.md",
    "A\tgenerated/metadata/x.json",
    "M\t_docs/2024/01/01/img.png",
    "R100\t_docs/a/b.md\tother/b.md",
  ].join("\n");
  const c = classify(parseNameStatus(out));
  it("classifies posts only", () => {
    expect(c.added.map((r: any) => r.path)).toEqual(["2026/11/25/gameplay-atlas.md"]);
    expect(c.modified.map((r: any) => r.path)).toEqual(["2024/01/01/a.mdx"]);
    expect(c.renamed).toEqual([{ status: "renamed", path: "2021/01/02/new.md", from: "2021/01/01/old.md" }]);
    expect(c.deleted.map((r: any) => r.path)).toEqual(["2020/01/01/gone.md", "a/b.md"]);
  });
  it("imports added, modified and renamed targets, never deleted", () => {
    expect(importable(c)).toEqual(["2026/11/25/gameplay-atlas.md", "2024/01/01/a.mdx", "2021/01/02/new.md"]);
  });
  it("derives legacy ids", () => {
    expect(legacyIdOf("2026/11/25/gameplay-atlas.md")).toBe("2026/11/25/gameplay-atlas");
    expect(legacyIdOf("2020/01/01/x/index.mdx")).toBe("2020/01/01/x");
  });
});

describe("image guard", () => {
  const cld = "https://res.cloudinary.com/demo/image/upload/a.png";
  it("accepts cloudinary only", () => {
    const text = `---\ncover:\n  url: ${cld}\n---\n# T\n![x](${cld})\n<img src="${cld}" />\n`;
    expect(offCloudinary([{ path: "p.md", text }])).toEqual([]);
  });
  it("flags relative, local and external images", () => {
    const text = `---\ncover:\n  url: ./cover.png\n  alt: x\n---\n![a](../img/a.png)\n![b](https://example.com/b.jpg "t")\n<img class="z" src='/c.png'>\n`;
    expect(imageRefs(text).sort()).toEqual(["../img/a.png", "./cover.png", "/c.png", "https://example.com/b.jpg"]);
    expect(offCloudinary([{ path: "p.md", text }])).toHaveLength(4);
  });
  it("ignores plain links and handles no frontmatter", () => {
    expect(imageRefs("[l](https://example.com)\n![i](https://res.cloudinary.com/x.png)")).toEqual(["https://res.cloudinary.com/x.png"]);
  });
});
