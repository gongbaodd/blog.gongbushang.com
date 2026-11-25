import { optimizeCloudinaryUrl } from "./cloudinary";

/**
 * The 3 legacy `.mdx` posts only use one JSX feature: `<DescriptionImage src alt [mah]>` around
 * markdown (plus its import line). Rather than add MDX, rewrite that component into plain HTML
 * (blank lines keep the inner markdown parsed) so `body_md` renders with the markdown pipeline.
 * MDX ignores the children's indentation, markdown would turn it into code blocks, so the children
 * are dedented. Any other JSX component is left alone and reported via `warnings`.
 */
const IMPORT_RE =
  /^import\s+\w+\s+from\s+['"]@\/packages\/image\/DescriptionImage['"];?[ \t]*\r?\n/gm;
const COMPONENT_RE = /<DescriptionImage\b([^>]*)>([\s\S]*?)<\/DescriptionImage>/g;

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}=(?:"([^"]*)"|\\{(\\d+)\\})`).exec(attrs);
  return m ? (m[1] ?? m[2]) : undefined;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function dedent(text: string): string {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, /^[ \t]*/.exec(l)![0].length))).join("\n");
}

export function prepareBody(body: string): { body: string; warnings: string[] } {
  if (!body.includes("DescriptionImage")) return { body, warnings: [] };
  let out = body.replace(IMPORT_RE, "");
  out = out.replace(COMPONENT_RE, (_m, attrs: string, inner: string) => {
    const src = optimizeCloudinaryUrl(attr(attrs, "src") ?? "");
    const alt = attr(attrs, "alt") ?? "";
    const mah = attr(attrs, "mah") ?? "400";
    return (
      `<div class="description-image">` +
      `<img src="${esc(src)}" alt="${esc(alt)}" style="max-height:${mah}px;object-fit:contain" />` +
      `\n\n<div class="description-image-text">\n\n${dedent(inner).trim()}\n\n</div></div>\n\n`
    );
  });
  const warnings = /<\/?[A-Z][A-Za-z]*[\s/>]/.test(out)
    ? ["unhandled JSX component remains in body"]
    : [];
  return { body: out, warnings };
}
