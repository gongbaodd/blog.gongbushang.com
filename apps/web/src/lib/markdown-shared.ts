/**
 * Browser-safe parts of the Markdown pipeline, shared by the public site (`./markdown.ts`, build time) and the
 * admin editor preview (`apps/admin/src/markdown-editor/render-browser.ts`, GON-249). Pure unified plugins only:
 * no Node APIs, no Shiki, no `@astrojs/markdown-remark`. The Docker admin build copies this file (apps/admin/Dockerfile).
 */
import remarkAttributes from "remark-attributes";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";
import { visit } from "unist-util-visit";
import { rehypeCloudinary } from "./cloudinary";

/** Shiki language aliases of the public site. */
export const SHIKI_LANG_ALIAS = { C: "c", plantuml: "PlantUML" } as const;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * ```mermaid fences -> <pre class="mermaid">. Rendering happens client-side via the
 * script injected by the `astro-mermaid` integration (astro.config.mjs). Its own
 * remark plugin is not exported, so this is a copy of its ~10 lines.
 */
export function remarkMermaid() {
  return (tree: any) => {
    visit(tree, "code", (node: any, index, parent: any) => {
      if (node.lang === "mermaid" && parent && typeof index === "number") {
        parent.children[index] = {
          type: "html",
          value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>`,
        };
      }
    });
  };
}

/**
 * MDX (legacy `.mdx` posts) has no indented code blocks: 4-space-indented lines after a blank line
 * continue prose/lists instead. Disable the `codeIndented` construct to match (fenced code is unaffected).
 */
export function remarkNoIndentedCode(this: any) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ disable: { null: ["codeIndented"] } });
}

/**
 * The post page renders the title as its own <h1> (BlogContent), so a body `# Heading` would be a second h1.
 * Astro collects `metadata.headings` after user rehype plugins, so a plugin would also drop the h1 from the
 * headings that `postTitle` needs. Strip the rendered elements instead (code samples contain escaped `&lt;h1`).
 */
export function stripBodyH1(html: string): string {
  return html.replace(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>\n?/g, "");
}

/** User remark plugins, in order. remarkMermaid must run before Shiki sees the code node. */
export function sharedRemarkPlugins(mdx: boolean): any[] {
  return [remarkMermaid, ...(mdx ? [remarkNoIndentedCode] : []), remarkAttributes, remarkMath];
}

/** User rehype plugins, in order (they run after syntax highlighting). */
export function sharedRehypePlugins(): any[] {
  return [
    rehypeCloudinary,
    [rehypeKatex, { strict: false }],
    [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] }],
  ];
}
