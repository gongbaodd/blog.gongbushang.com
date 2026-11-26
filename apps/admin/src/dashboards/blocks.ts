/**
 * Renders the dashboard link list as an EmDash Block Kit response. Links use the host-resolved `external` target, which the admin
 * opens with `target="_blank" rel="noopener noreferrer"`.
 */
import type { DashboardCategory } from "./links.ts";

// Structural subset of `@emdash-cms/blocks` (not a direct dependency of apps/admin); the host validates the real shape at runtime.
interface ExternalLink {
	type: "link";
	label: string;
	target: { kind: "external"; url: string };
}
export type Block =
	| { type: "header" | "context"; text: string }
	| { type: "divider" }
	| { type: "section"; text: string; accessory: ExternalLink }
	| { type: "actions"; elements: ExternalLink[] };
export interface BlockResponse {
	blocks: Block[];
}

export function dashboardPage(categories: DashboardCategory[]): BlockResponse {
	const blocks: Block[] = [];
	for (const category of categories) {
		blocks.push({ type: "header", text: category.title });
		for (const link of category.links) {
			blocks.push({
				type: "section",
				text: `**${link.label}**: ${link.purpose}`,
				accessory: { type: "link", label: "Open", target: { kind: "external", url: link.url } },
			});
		}
		blocks.push({ type: "divider" });
	}
	return { blocks };
}

/** Compact variant for the main dashboard widget: one row of link buttons per category. */
export function dashboardWidget(categories: DashboardCategory[]): BlockResponse {
	const blocks: Block[] = [];
	for (const category of categories) {
		blocks.push({ type: "context", text: category.title });
		blocks.push({
			type: "actions",
			elements: category.links.map((link) => ({
				type: "link" as const,
				label: link.label,
				target: { kind: "external" as const, url: link.url },
			})),
		});
	}
	return { blocks };
}
