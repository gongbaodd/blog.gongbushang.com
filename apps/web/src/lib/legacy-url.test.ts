import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePostPath, parseRetiredPostPath, postParams, postPath, retiredPostPath, tagHref, tagSlug, viewCountPath } from "./legacy-url";
import { prepareBody } from "./mdx-lite";
import { mapPost, postTitle, quickTitle } from "./content";

const urls = readFileSync(new URL("../../tests/legacy-urls.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const retiredPostUrls = urls.filter((u) => parseRetiredPostPath(u));

describe("post URL mapping (GON-270: /YYYY/MM/DD/slug/, no category)", () => {
  it("recognises all 995 legacy post paths in the snapshot as retired category paths", () => {
    expect(retiredPostUrls.length).toBe(995);
    // None of them is a new-style path, so the two parsers never overlap.
    expect(urls.filter((u) => parsePostPath(u)).length).toBe(0);
  });

  it("round-trips every legacy post path: parse -> params -> new path, and back to the retired path", () => {
    const seen = new Set<string>();
    for (const url of retiredPostUrls) {
      const { category, legacyId } = parseRetiredPostPath(url)!;
      const params = postParams(legacyId)!;
      expect(params, url).toBeDefined();
      expect(`/${params.year}/${params.month}/${params.day}/${params.slug}/`).toBe(postPath(legacyId));
      expect(parsePostPath(postPath(legacyId))).toEqual({ legacyId });
      expect(retiredPostPath(legacyId, category)).toBe(url);
      // The date and slug tail of every legacy URL is kept, and no two legacy posts collapse onto the same new URL.
      expect(url.endsWith(postPath(legacyId))).toBe(true);
      expect(seen.has(postPath(legacyId)), url).toBe(false);
      seen.add(postPath(legacyId));
    }
    expect(seen.size).toBe(995);
  });

  it("handles representative fixtures", () => {
    expect(postParams("2025/02/21/puzzle-game")).toEqual({ year: "2025", month: "02", day: "21", slug: "puzzle-game" });
    expect(postPath("2016/10/29/quiet-echo-wall--yonghe-palace")).toBe("/2016/10/29/quiet-echo-wall--yonghe-palace/");
    expect(retiredPostPath("2016/10/29/quiet-echo-wall--yonghe-palace", "life")).toBe("/life/2016/10/29/quiet-echo-wall--yonghe-palace/");
  });

  it("rejects malformed ids and non-post paths", () => {
    expect(postParams("2025/02/puzzle")).toBeUndefined();
    expect(postParams("2025/02/21/a/b")).toBeUndefined();
    expect(parsePostPath("/fe/2025/02/21/x/")).toBeUndefined();
    expect(parsePostPath("/year/2025/")).toBeUndefined();
  });

  it("view-count key: the retired path for an imported post, the current path otherwise", () => {
    expect(viewCountPath("2025/02/21/puzzle-game", "fe")).toBe("/fe/2025/02/21/puzzle-game");
    expect(viewCountPath("2026/12/01/new-post")).toBe("/2026/12/01/new-post");
  });

  it("encodes tag hrefs (c# stays a path, not a fragment)", () => {
    expect(tagHref("c#")).toBe("/tag/c-sharp");
    expect(tagHref("C#")).toBe("/tag/c-sharp");
    expect(tagHref("c-sharp")).toBe("/tag/c-sharp");
    expect(tagSlug("F#")).toBe("f-sharp");
    expect(tagHref("aframe.js")).toBe("/tag/aframe.js");
  });
});

describe("mapPost", () => {
  const base = {
    legacy_id: "2021/02/10/matrix",
    legacy_date: "2021-02-10",
    title: "t",
    body_md: "# 矩阵\n",
    adsense: false,
    series_number: 3,
    terms: {
      category: [{ slug: "book", label: "book" }],
      tag: [{ slug: "math", label: "Math" }],
      series: [{ slug: "linear", label: "线性代数" }],
      city: [{ slug: "dalian-china", label: "Dalian, China" }],
    },
  };

  it("maps terms, series number, city, date", () => {
    const p = mapPost({ id: "x", data: base })!;
    expect(p.href).toBe("/2021/02/10/matrix/");
    expect(p.viewPath).toBe("/book/2021/02/10/matrix");
    expect(p.date).toBe("2021-02-10");
    expect(p.data.tag).toEqual(["Math"]);
    expect(p.data.series).toEqual({ slug: "linear", name: "线性代数", number: 3 });
    expect(p.data.city).toEqual([{ slug: "dalian-china", label: "Dalian, China" }]);
  });

  it("skips non-legacy entries; a missing category is allowed", () => {
    expect(mapPost({ id: "hello", data: { title: "Hello" } })).toBeUndefined();
    expect(mapPost({ id: "x", data: { ...base, terms: {} } })!.data.category).toBeUndefined();
  });

  it("title follows the legacy rule: first heading, else slug", () => {
    const p = mapPost({ id: "x", data: base })!;
    expect(postTitle(p, [{ text: "H" }])).toBe("H");
    expect(quickTitle({ ...p, body: "```\n# not a title\n```\n## Real\n" })).toBe("Real");
    expect(postTitle({ id: "2020/01/01/a-b", cmsTitle: "" }, [])).toBe("a b");
  });
});

describe("prepareBody (MDX DescriptionImage)", () => {
  it("turns DescriptionImage into plain HTML and drops the import", () => {
    const src = `import DescriptionImage from '@/packages/image/DescriptionImage';\n\n# T\n\n<DescriptionImage src="/a.gif" alt="x" mah={1600}>\ntext **b**\n</DescriptionImage>\n`;
    const { body, warnings, mdx } = prepareBody(src);
    expect(warnings).toEqual([]);
    expect(mdx).toBe(true);
    expect(body).not.toMatch(/import /);
    expect(body).toContain('<img src="/a.gif" alt="x" style="max-height:1600px');
    expect(body).not.toContain("DescriptionImage");
  });

  it("does not flag mdx for prose that merely mentions DescriptionImage", () => {
    const src = "# a\n\nUse the DescriptionImage component.\n\n    indented code\n";
    const r = prepareBody(src);
    expect(r.mdx).toBe(false);
    expect(r.body).toBe(src);
  });

  it("does not flag mdx for <DescriptionImage> without the import", () => {
    const r = prepareBody('# a\n\n<DescriptionImage src="/a.gif" alt="x">\ntext\n</DescriptionImage>\n');
    expect(r.mdx).toBe(false);
  });

  it("leaves plain markdown untouched", () => {
    expect(prepareBody("# a\n").body).toBe("# a\n");
    expect(prepareBody("# a\n").mdx).toBe(false);
  });
});
