import { createMarkdownProcessor, type MarkdownHeading } from "@astrojs/markdown-remark";
import { bundledLanguages } from "shiki";
import plantumlGrammar from "shiki-plantuml";
import { SHIKI_LANG_ALIAS, sharedRehypePlugins, sharedRemarkPlugins, stripBodyH1 } from "./markdown-shared";

// The plugin list and `stripBodyH1` live in ./markdown-shared so the admin editor preview renders with the same plugins (GON-249).
export { stripBodyH1 };

const processors: Partial<Record<"md" | "mdx", ReturnType<typeof createMarkdownProcessor>>> = {};

function getProcessor(mdx = false) {
  const key = mdx ? "mdx" : "md";
  processors[key] ??= createMarkdownProcessor({
    remarkPlugins: sharedRemarkPlugins(mdx),
    rehypePlugins: sharedRehypePlugins(),
    syntaxHighlight: "shiki",
    shikiConfig: {
      langAlias: { ...SHIKI_LANG_ALIAS },
      langs: [...Object.values(bundledLanguages), plantumlGrammar as any],
    },
  } as any);
  return processors[key]!;
}

export interface RenderedMarkdown {
  html: string;
  /** All headings including a body h1. The title rule (`postTitle`) reads the first one. */
  headings: MarkdownHeading[];
  /** Headings for the TOC / side menu: depth-1 entries removed (that h1 is not in `html`). */
  menuHeadings: MarkdownHeading[];
}

/** Build-time only: call from prerendered pages, never from a Worker request path. */
export async function renderMarkdown(
  source: string,
  opts: { mdx?: boolean } = {},
): Promise<RenderedMarkdown> {
  const p = await getProcessor(opts.mdx);
  const result = await p.render(source);
  const headings = result.metadata.headings ?? [];
  return { html: stripBodyH1(result.code), headings, menuHeadings: headings.filter((h) => h.depth !== 1) };
}
