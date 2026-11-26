/**
 * Renders the dashboard link list as an EmDash Block Kit response. Links use the host-resolved `external` target, which the admin
 * opens with `target="_blank" rel="noopener noreferrer"`.
 */
import type { DashboardCategory } from "./links.ts";
import { describeTokenExpiry, TOKEN_ROTATE_URL, type TokenExpiryState } from "./token-expiry.ts";

// Structural subset of `@emdash-cms/blocks` (not a direct dependency of apps/admin); the host validates the real shape at runtime.
interface ExternalLink {
	type: "link";
	label: string;
	target: { kind: "external"; url: string };
}
export type Block =
	| { type: "header" | "context"; text: string }
	| { type: "divider" }
	| { type: "section"; text: string; accessory?: ExternalLink }
	| { type: "actions"; elements: ExternalLink[] };
export interface BlockResponse {
	blocks: Block[];
}

const rotateButton: ExternalLink = { type: "link", label: "Rotate token", target: { kind: "external", url: TOKEN_ROTATE_URL } };

/**
 * Token expiry blocks. Warning and expired render on the page and the widget; healthy is a quiet line on the page only;
 * unset is a notice on the page, only in production.
 */
export function tokenExpiryBlocks(state: TokenExpiryState, surface: "page" | "widget", production: boolean): Block[] {
	const text = describeTokenExpiry(state);
	if (state.status === "warning" || state.status === "expired") {
		return [
			{ type: "section", text: `**${text}**` },
			{ type: "actions", elements: [rotateButton] },
			{ type: "divider" },
		];
	}
	if (surface !== "page") return [];
	if (state.status === "healthy") {
		return [
			{ type: "context", text },
			{ type: "actions", elements: [{ ...rotateButton, label: "GitHub fine-grained PATs" }] },
			{ type: "divider" },
		];
	}
	return production ? [{ type: "context", text }, { type: "divider" }] : [];
}

export function dashboardPage(categories: DashboardCategory[], expiry: Block[] = []): BlockResponse {
	const blocks: Block[] = [...expiry];
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
export function dashboardWidget(categories: DashboardCategory[], expiry: Block[] = []): BlockResponse {
	const blocks: Block[] = [...expiry];
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
