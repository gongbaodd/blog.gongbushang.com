import { remark } from "remark";
import strip from "strip-markdown";
import { visit } from "unist-util-visit";
import type { Image, Parent, Root } from "mdast";

function remarkImagesToAlt() {
  return (tree: Root) => {
    visit(tree, "image", (node: Image, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      parent.children[index] = { type: "text", value: node.alt ?? "" };
    });
  };
}

export async function md2txt(content: string): Promise<string> {
  const file = await remark()
    .use(remarkImagesToAlt)
    .use(strip)
    .process(content);
  return String(file).trimEnd();
}
