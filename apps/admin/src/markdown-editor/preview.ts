/**
 * Browser-side preview pipeline (GON-249): Markdown -> HTML (./render-browser.ts) -> Mermaid SVGs -> sandboxed `srcdoc`.
 * Mermaid is lazy-loaded the first time a post has a diagram. KaTeX CSS and fonts are bundled by Vite from node_modules (no CDN).
 */
// `?inline` makes Vite return the stylesheet as a string; its font URLs become hashed local assets.
import katexCss from "katex/dist/katex.min.css?inline";
import { mermaidErrorBlock, PREVIEW_CSS, previewDocument, replaceMermaidBlocks } from "./preview-html.ts";
import { renderBodyBrowser } from "./render-browser.ts";

let mermaidReady: Promise<typeof import("mermaid").default> | undefined;
let mermaidQueue: Promise<unknown> = Promise.resolve();
let mermaidCounter = 0;

function loadMermaid() {
	mermaidReady ??= import("mermaid").then(({ default: mermaid }) => {
		// "strict" makes Mermaid sanitize labels and refuse click handlers; the same default the public site's script uses.
		mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
		return mermaid;
	});
	return mermaidReady;
}

/** Mermaid renders through shared DOM scratch nodes, so diagrams are rendered one at a time. */
function renderDiagram(source: string): Promise<string> {
	const run = async () => {
		try {
			const mermaid = await loadMermaid();
			const { svg } = await mermaid.render(`gb-mermaid-${++mermaidCounter}`, source);
			return svg;
		} catch (error) {
			return mermaidErrorBlock(error instanceof Error ? error.message : String(error));
		}
	};
	const next = mermaidQueue.then(run, run);
	mermaidQueue = next;
	return next;
}

export async function renderPreview(body: string): Promise<string> {
	const { html } = await renderBodyBrowser(body);
	return previewDocument(await replaceMermaidBlocks(html, renderDiagram), `${katexCss}${PREVIEW_CSS}`);
}
