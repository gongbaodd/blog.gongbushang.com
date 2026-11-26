import { createMarkdownProcessor, type MarkdownHeading } from "@astrojs/markdown-remark";
import { bundledLanguages } from "shiki";
import plantumlGrammar from "shiki-plantuml";
import remarkAttributes from "remark-attributes";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";
import { visit } from "unist-util-visit";
import { rehypeCloudinary } from "./cloudinary";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * ```mermaid fences -> <pre class="mermaid">. Rendering happens client-side via the
 * script injected by the `astro-mermaid` integration (astro.config.mjs). Its own
 * remark plugin is not exported, so this is a copy of its ~10 lines.
 */
function remarkMermaid() {
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
function remarkNoIndentedCode(this: any) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ disable: { null: ["codeIndented"] } });
}

const processors: Partial<Record<"md" | "mdx", ReturnType<typeof createMarkdownProcessor>>> = {};

function getProcessor(mdx = false) {
  const key = mdx ? "mdx" : "md";
  processors[key] ??= createMarkdownProcessor({
    // remarkMermaid must run before Shiki sees the code node
    remarkPlugins: [
      remarkMermaid,
      ...(mdx ? [remarkNoIndentedCode] : []),
      remarkAttributes,
      remarkMath,
    ],
    rehypePlugins: [
      rehypeCloudinary,
      [rehypeKatex, { strict: false }],
      [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] }],
    ],
    syntaxHighlight: "shiki",
    shikiConfig: {
      langAlias: { C: "c", plantuml: "PlantUML" },
      langs: [...Object.values(bundledLanguages), plantumlGrammar as any],
    },
  } as any);
  return processors[key]!;
}

export interface RenderedMarkdown {
  html: string;
  headings: MarkdownHeading[];
}

/** Build-time only: call from prerendered pages, never from a Worker request path. */
export async function renderMarkdown(
  source: string,
  opts: { mdx?: boolean } = {},
): Promise<RenderedMarkdown> {
  const p = await getProcessor(opts.mdx);
  const result = await p.render(source);
  return { html: result.code, headings: result.metadata.headings ?? [] };
}
