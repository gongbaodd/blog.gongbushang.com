/**
 * Browser-safe Markdown renderer for the editor preview (GON-249).
 *
 * Same stages and plugins as the public site's `renderMarkdown` (apps/web/src/lib/markdown.ts, Astro's
 * `createMarkdownProcessor`): remark-parse, GFM, smartypants, the shared remark plugins, remark-rehype, Shiki, the shared rehype
 * plugins, heading ids, rehype-raw, stringify. Differences, all deliberate:
 *   - Shiki uses `shiki/core` + the JavaScript regex engine (no WASM) and loads grammars on demand (./shiki-langs.ts).
 *   - Astro's image-asset collection (`remarkCollectImages`, `rehypeImages`) is skipped: bodies only hold remote Cloudinary images.
 *   - `@astrojs/markdown-remark` is not imported: its entry pulls Node-only and MDX code that cannot run in a browser.
 * The `.mdx` posts need no MDX compiler: `prepareBody` (apps/web/src/lib/mdx-lite.ts) rewrites the one JSX component they use,
 * exactly as the public page does, and `mdx: true` only disables indented code.
 */
import GithubSlugger from "github-slugger";
import { toText } from "hast-util-to-text";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkSmartypants from "remark-smartypants";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "shiki/themes/github-dark.mjs";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { sharedRehypePlugins, sharedRemarkPlugins, stripBodyH1 } from "../../../web/src/lib/markdown-shared.ts";
import { prepareBody } from "../../../web/src/lib/mdx-lite.ts";
import { loadGrammar, resolveGrammarKey } from "./shiki-langs.ts";

export interface BrowserRendered {
	html: string;
	headings: { depth: number; slug: string; text: string }[];
}

const THEME = "github-dark";
const EXCLUDED_FENCE_LANGS = new Set(["math"]);
const LANG_RE = /\blanguage-(\S+)\b/;

let highlighterPromise: Promise<HighlighterCore> | undefined;
const loadedGrammars = new Map<string, Promise<string | undefined>>();

function getHighlighter(): Promise<HighlighterCore> {
	highlighterPromise ??= createHighlighterCore({ themes: [githubDark], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) });
	return highlighterPromise;
}

/** Load a grammar once; resolves to the name Shiki registered it under, or undefined when the language is unknown. */
function ensureLanguage(highlighter: HighlighterCore, fenceLang: string): Promise<string | undefined> {
	const key = resolveGrammarKey(fenceLang);
	if (!key) return Promise.resolve(undefined);
	let pending = loadedGrammars.get(key);
	if (!pending) {
		pending = loadGrammar(key).then(async (grammar) => {
			await highlighter.loadLanguage(grammar as never);
			const first = Array.isArray(grammar) ? grammar[0] : grammar;
			return (first as { name: string }).name;
		});
		loadedGrammars.set(key, pending);
	}
	return pending.catch(() => undefined);
}

/** Port of Astro's `highlightCodeBlocks` + `createShikiHighlighter` output shape (`astro-code` class, `data-language`, overflow style). */
function rehypeShikiLazy() {
	return async (tree: any) => {
		const targets: { node: any; lang: string; parent: any; grand: any }[] = [];
		visit(tree, "element", (node: any, _i: number | undefined, parent: any) => {
			if (node.tagName !== "code" || parent?.type !== "element" || parent.tagName !== "pre" || parent.children.length !== 1) return;
			const classes = Array.isArray(node.properties?.className) ? node.properties.className : [node.properties?.className];
			let lang = "plaintext";
			for (const c of classes) {
				const m = typeof c === "string" ? LANG_RE.exec(c) : null;
				if (m) {
					lang = m[1]!;
					break;
				}
			}
			if (EXCLUDED_FENCE_LANGS.has(lang)) return;
			targets.push({ node, lang, parent, grand: undefined });
		});
		if (targets.length === 0) return;
		// Grandparent lookup needs a second pass (visit() only gives the direct parent).
		visit(tree, (node: any) => {
			if (!node.children) return;
			for (const t of targets) if (node.children.includes(t.parent)) t.grand = node;
		});
		const highlighter = await getHighlighter();
		for (const t of targets) {
			const registered = t.lang === "plaintext" ? undefined : await ensureLanguage(highlighter, t.lang);
			const code = toText(t.node, { whitespace: "pre" }).replace(/(?:\r\n|\r|\n)$/, "");
			const shown = registered ? t.lang : "plaintext";
			const root = highlighter.codeToHast(code, {
				lang: registered ?? "text",
				theme: THEME,
				transformers: [
					{
						pre(pre: any) {
							const cls = String(Array.isArray(pre.properties.class) ? pre.properties.class.join(" ") : pre.properties.class ?? "");
							pre.properties.class = cls.replace(/shiki/g, "astro-code");
							pre.properties.dataLanguage = shown;
							pre.properties.style = `${pre.properties.style ?? ""}; overflow-x: auto;`;
						},
					},
				],
			});
			const replacement = root.children[0];
			if (t.grand && replacement) t.grand.children[t.grand.children.indexOf(t.parent)] = replacement;
		}
	};
}

/** Port of Astro's `rehypeHeadingIds` for Markdown (non-MDX) sources: ids via github-slugger, same text rules. */
function rehypeHeadingIds() {
	return (tree: any, file: any) => {
		const headings: BrowserRendered["headings"] = [];
		const slugger = new GithubSlugger();
		visit(tree, (node: any) => {
			if (node.type !== "element" || !/^h[0-6]$/.test(node.tagName)) return;
			const depth = Number.parseInt(node.tagName.slice(1), 10);
			let text = "";
			visit(node, (child: any, _i: number | undefined, parent: any) => {
				if (child.type === "element" || parent == null) return;
				if (child.type === "raw" && /^\n?<.*>\n?$/.test(child.value)) return;
				if ((child.type === "text" || child.type === "raw") && "value" in child) {
					if (parent.tagName === "code" || parent.tagName === "pre") text += child.value;
					else text += child.value.replace(/\{/g, "${");
				}
			});
			node.properties ||= {};
			if (typeof node.properties.id !== "string") node.properties.id = slugger.slug(text);
			headings.push({ depth, slug: node.properties.id, text });
		});
		file.data.headings = headings;
	};
}

function buildProcessor(mdx: boolean) {
	const parser: any = unified().use(remarkParse).use(remarkGfm).use(remarkSmartypants, {});
	for (const p of sharedRemarkPlugins(mdx)) Array.isArray(p) ? parser.use(p[0], p[1]) : parser.use(p);
	parser.use(remarkRehype, { allowDangerousHtml: true, passThrough: [] }).use(rehypeShikiLazy);
	for (const p of sharedRehypePlugins()) Array.isArray(p) ? parser.use(p[0], p[1]) : parser.use(p);
	return parser.use(rehypeHeadingIds).use(rehypeRaw).use(rehypeStringify, { allowDangerousHtml: true });
}

const processors: Partial<Record<"md" | "mdx", ReturnType<typeof buildProcessor>>> = {};

/** Render a `body_md` value the way the public post page does (prepareBody, then the Markdown pipeline, body h1 removed). */
export async function renderBodyBrowser(body: string): Promise<BrowserRendered> {
	const prepared = prepareBody(body);
	const key = prepared.mdx ? "mdx" : "md";
	processors[key] ??= buildProcessor(prepared.mdx);
	const file = await processors[key]!.process(prepared.body);
	return { html: stripBodyH1(String(file.value)), headings: (file.data as any).headings ?? [] };
}
