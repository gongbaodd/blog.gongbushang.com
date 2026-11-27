/**
 * Pure string helpers for the preview document (GON-249). No DOM, no network, so they are unit-tested in Node.
 */

const MERMAID_RE = /<pre class="mermaid">([\s\S]*?)<\/pre>/g;

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
/** Text content of an HTML-escaped string. rehype-raw re-serialises the escapes as numeric references (`&#x3C;`). */
const unescapeHtml = (s: string) =>
	s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) =>
		hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(parseInt(dec, 10)) : (NAMED[name.toLowerCase()] ?? m),
	);
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Diagram sources in document order. `remarkMermaid` escapes `&`, `<` and `>`, so a literal `</pre>` cannot occur inside one. */
export function extractMermaidSources(html: string): string[] {
	return [...html.matchAll(MERMAID_RE)].map((m) => unescapeHtml(m[1]!));
}

/** Replace each `<pre class="mermaid">` with the markup returned by `render` (an SVG string, or an error notice). */
export async function replaceMermaidBlocks(html: string, render: (source: string) => Promise<string>): Promise<string> {
	const sources = extractMermaidSources(html);
	if (sources.length === 0) return html;
	const rendered: string[] = [];
	for (const source of sources) rendered.push(await render(source));
	let i = 0;
	return html.replace(MERMAID_RE, () => `<div class="mermaid-rendered">${rendered[i++]}</div>`);
}

export function mermaidErrorBlock(message: string): string {
	return `<pre class="mermaid-error">${escapeHtml(message)}</pre>`;
}

/** Full `srcdoc` for the sandboxed preview frame. The frame runs no script: HTML from a post cannot reach the admin session. */
export function previewDocument(bodyHtml: string, css: string): string {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${css}</style></head><body><article class="preview">${bodyHtml}</article></body></html>`;
}

/** Typography for the preview frame: a readable approximation of the public post, not a pixel copy. */
export const PREVIEW_CSS = `
:root{color-scheme:light}
body{margin:0;padding:16px 20px;background:#fff;color:#1f2328;font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
.preview>*:first-child{margin-top:0}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .6em}
h2{border-bottom:1px solid #d8dee4;padding-bottom:.25em}
a{color:#0969da}
img{max-width:100%;height:auto}
blockquote{margin:1em 0;padding:0 1em;color:#59636e;border-left:.25em solid #d1d9e0}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:#eff1f3;padding:.15em .35em;border-radius:4px}
pre{overflow:auto;padding:12px 14px;border-radius:6px;line-height:1.45}
pre code{background:none;padding:0;color:inherit}
pre.astro-code{margin:1em 0}
table{border-collapse:collapse;display:block;overflow:auto}
th,td{border:1px solid #d1d9e0;padding:6px 12px}
hr{border:0;border-top:1px solid #d1d9e0;margin:2em 0}
.description-image{display:flex;gap:16px;align-items:flex-start;margin:1em 0}
.description-image-text{flex:1}
.mermaid-rendered{margin:1em 0;overflow:auto;text-align:center}
.mermaid-error{color:#cf222e;background:#ffebe9;white-space:pre-wrap}
.katex-display{overflow-x:auto;overflow-y:hidden}
`;
