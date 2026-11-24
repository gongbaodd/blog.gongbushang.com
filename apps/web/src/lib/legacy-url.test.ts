import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePostPath, postParams, postPath, tagHref } from "./legacy-url";
import { prepareBody } from "./mdx-lite";
import { mapPost, postTitle, quickTitle } from "./content";

const urls = readFileSync(new URL("../../tests/legacy-urls.txt", import.meta.url), "utf8")
	.split("\n")
	.filter((l) => l && !l.startsWith("#"));
const postUrls = urls.filter((u) => parsePostPath(u));

describe("post URL mapping (legacy_id + category -> path)", () => {
	it("recognises all 995 legacy post paths in the snapshot", () => {
		expect(postUrls.length).toBe(995);
	});

	it("round-trips every legacy post path: parse -> params -> path", () => {
		for (const url of postUrls) {
			const { category, legacyId } = parsePostPath(url)!;
			const params = postParams(legacyId, category)!;
			expect(params, url).toBeDefined();
			expect(`/${params.category}/${params.year}/${params.month}/${params.day}/${params.slug}/`).toBe(url);
			expect(postPath(legacyId, category)).toBe(url);
		}
	});

	it("handles representative fixtures", () => {
		expect(postParams("2025/02/21/puzzle-game", "fe")).toEqual({
			category: "fe", year: "2025", month: "02", day: "21", slug: "puzzle-game",
		});
		expect(postPath("2016/10/29/quiet-echo-wall--yonghe-palace", "life")).toBe(
			"/life/2016/10/29/quiet-echo-wall--yonghe-palace/",
		);
	});

	it("rejects malformed ids", () => {
		expect(postParams("2025/02/puzzle", "fe")).toBeUndefined();
		expect(postParams("2025/02/21/a/b", "fe")).toBeUndefined();
		expect(postParams("2025/02/21/x", "")).toBeUndefined();
	});

	it("encodes tag hrefs (c# stays a path, not a fragment)", () => {
		expect(tagHref("c#")).toBe("/tag/c%23");
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
		expect(p.href).toBe("/book/2021/02/10/matrix/");
		expect(p.date).toBe("2021-02-10");
		expect(p.data.tag).toEqual(["math"]);
		expect(p.data.series).toEqual({ slug: "linear", name: "线性代数", number: 3 });
		expect(p.data.city).toEqual([{ slug: "dalian-china", label: "Dalian, China" }]);
	});

	it("skips non-legacy entries and throws without a category", () => {
		expect(mapPost({ id: "hello", data: { title: "Hello" } })).toBeUndefined();
		expect(() => mapPost({ id: "x", data: { ...base, terms: {} } })).toThrow(/category/);
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
		const { body, warnings } = prepareBody(src);
		expect(warnings).toEqual([]);
		expect(body).not.toMatch(/import /);
		expect(body).toContain('<img src="/a.gif" alt="x" style="max-height:1600px');
		expect(body).not.toContain("DescriptionImage");
	});

	it("leaves plain markdown untouched", () => {
		expect(prepareBody("# a\n").body).toBe("# a\n");
	});
});
