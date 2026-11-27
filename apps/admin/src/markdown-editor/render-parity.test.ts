/**
 * Preview parity (GON-249): the browser renderer must produce the same HTML as the public site's `renderMarkdown`
 * (apps/web/src/lib/markdown.ts) for the same body. Fixtures cover KaTeX, Mermaid, PlantUML, `{.class}` attributes, the
 * `.mdx` DescriptionImage rewrite, tables, footnotes, smart punctuation, Shiki, headings and CRLF input.
 *
 * Shiki differs by engine (Oniguruma at build time, the JS regex engine in the browser), so highlighted blocks are compared
 * after stripping token colour spans; every other element must match exactly.
 * With `MD_CORPUS_DATABASE_URL` set to a loopback database, a sample of real posts (including the `.mdx` ones) is compared too.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { prepareBody } from "../../../web/src/lib/mdx-lite.ts";
import { renderMarkdown } from "../../../web/src/lib/markdown.ts";
import { extractMermaidSources } from "./preview-html.ts";
import { renderBodyBrowser } from "./render-browser.ts";

/** Compare structure and text, ignoring Shiki token colouring (engine-dependent) but keeping the block, class and language. */
function normalise(html: string): string {
	return html
		.replace(/<span style="color:#[0-9A-Fa-f]{6}(?:;[^"]*)?">/g, "<span>")
		.replace(/<span>([^<]*)<\/span>/g, "$1")
		.replace(/<span class="line">([\s\S]*?)<\/span>(\n|<\/code>)/g, "$1$2")
		.replace(/\s+/g, " ")
		.trim();
}

const FIXTURES: Record<string, string> = {
	prose: "# Title\n\nIntro with *emphasis*, **strong**, ~~strike~~ and `code`. \"Quotes\" -- and... dashes.\n\n## Section One\n\nText [link](https://example.com) and ![img](https://res.cloudinary.com/demo/image/upload/v1/a.jpg).\n\n### Sub heading {#custom}\n\n- a\n- b\n  - c\n\n1. one\n2. two\n\n> quote\n",
	table: "| a | b |\n|---|:-:|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\nFootnote[^1].\n\n[^1]: The note.\n",
	math: "Inline $E = mc^2$ and block:\n\n$$\n\\int_0^1 x^2\\,dx = \\tfrac{1}{3}\n$$\n\nBroken $\\frac{1$ stays non-fatal.\n",
	mermaid: "```mermaid\ngraph TD\n  A[\"a < b & c\"] --> B\n```\n\nafter\n",
	attributes: "A paragraph with a class{.note}\n\n![alt](https://res.cloudinary.com/demo/image/upload/v1/b.png){.wide}\n",
	code: "```js\nconst a = 1; // js\nfunction f(x) { return x * 2; }\n```\n\n```rust\nfn main() { println!(\"hi\"); }\n```\n\n```plantuml\n@startuml\nAlice -> Bob: hi\n@enduml\n```\n\n```unknown-lang\nplain\n```\n\n```\nno lang\n```\n\n    indented code\n",
	shell: "```shell\n$ ls -la\n```\n\n```bash\necho \"x\"\n```\n\n```c#\nvar x = 1;\n```\n\n```py\nprint(1)\n```\n",
	rawHtml: "<div class=\"box\">raw <b>html</b></div>\n\n<details><summary>More</summary>\n\nBody\n\n</details>\n\nExternal [out](https://example.org).\n",
	crlf: "# T\r\n\r\nline one\r\nline two\r\n\r\n```js\r\nlet a;\r\n```\r\n",
	mdx: 'import DescriptionImage from "@/packages/image/DescriptionImage";\n\nIntro.\n\n<DescriptionImage src="https://res.cloudinary.com/demo/image/upload/v1/c.jpg" alt="c" mah={300}>\n    - inside list\n    - second\n</DescriptionImage>\n\nOpponent:\n    \n    - Move A\n    - Move B\n',
};

async function both(body: string) {
	const prepared = prepareBody(body);
	const site = await renderMarkdown(prepared.body, { mdx: prepared.mdx });
	const browser = await renderBodyBrowser(body);
	return { site, browser };
}

describe("browser preview renders like the public site", { timeout: 60_000 }, () => {
	for (const [name, body] of Object.entries(FIXTURES)) {
		it(`${name}: same HTML`, async () => {
			const { site, browser } = await both(body);
			expect(normalise(browser.html)).toBe(normalise(site.html));
		});

		it(`${name}: same headings`, async () => {
			const { site, browser } = await both(body);
			expect(browser.headings).toEqual(site.headings);
		});
	}

	it("emits KaTeX markup and keeps the Mermaid source for the lazy renderer", async () => {
		const { browser } = await both(`${FIXTURES.math}\n${FIXTURES.mermaid}`);
		expect(browser.html).toContain('class="katex"');
		expect(extractMermaidSources(browser.html)).toEqual(["graph TD\n  A[\"a < b & c\"] --> B"]);
	});

	it("highlights PlantUML and known languages, and falls back to plain text for unknown ones", async () => {
		const { browser } = await both(FIXTURES.code!);
		expect(browser.html).toMatch(/data-language="plantuml"/);
		expect(browser.html).toMatch(/data-language="js"/);
		expect(browser.html).toMatch(/data-language="plaintext"/);
		expect(browser.html).toContain("astro-code");
	});

	it("rewrites the .mdx DescriptionImage component like the public page (no MDX compiler needed)", async () => {
		const { browser } = await both(FIXTURES.mdx!);
		expect(browser.html).toContain('class="description-image"');
		expect(browser.html).not.toContain("<DescriptionImage");
		expect(browser.html).not.toContain("import ");
	});
});

const url = process.env.MD_CORPUS_DATABASE_URL;
const loopback = url ? ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname) : false;

describe.skipIf(!url || !loopback)("sample of stored posts", { timeout: 300_000 }, () => {
	it("renders the same HTML in the browser pipeline (all .mdx posts plus a spread of the rest)", async () => {
		const client = new pg.Client({ connectionString: url });
		await client.connect();
		let rows: { slug: string; body_md: string }[];
		try {
			({ rows } = await client.query("select slug, body_md from ec_posts where body_md is not null order by slug"));
		} finally {
			await client.end();
		}
		const mdx = rows.filter((r) => r.body_md.includes("DescriptionImage"));
		const rest = rows.filter((r) => !r.body_md.includes("DescriptionImage"));
		const step = Math.max(1, Math.floor(rest.length / 60));
		const sample = [...mdx, ...rest.filter((_, i) => i % step === 0)];
		const differing: string[] = [];
		for (const { slug, body_md } of sample) {
			const { site, browser } = await both(body_md);
			if (normalise(site.html) !== normalise(browser.html)) differing.push(slug);
		}
		console.log(`[parity] compared=${sample.length} mdx=${mdx.length} differing=${differing.length} ${differing.join(",")}`);
		expect(differing).toEqual([]);
	});
});
