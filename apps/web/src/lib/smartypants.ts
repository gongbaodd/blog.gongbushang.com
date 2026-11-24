// Legacy page titles came from rendered headings, which Astro runs through remark-smartypants
// (curly quotes, ellipsis, dashes). EmDash stores the raw heading text, so list titles get the same pass.
import { remark } from "remark";
import remarkSmartypants from "remark-smartypants";

let processor: any;

export async function smartypants(text: string): Promise<string> {
	processor ??= remark().use(remarkSmartypants);
	const tree: any = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: text }] }] };
	await processor.run(tree);
	return tree.children[0].children[0].value as string;
}
