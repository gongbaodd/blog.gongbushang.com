/**
 * EmDash Block Kit UI renderer for the `podcast-sync` plugin (admin page + dashboard widget).
 *
 * Uses the exact `snake_case` wire format validated by `@emdash-cms/blocks@1.6.0`.
 * Note: `SandboxedPluginWidget` ignores `toast` and renders `blocks` only, so all sync results,
 * warnings, and error messages are always rendered inside `blocks` too.
 */
import type { SyncResult } from "./sync.ts";

export const ACTION_CHECK_RSS = "podcast_sync_check";
export const ACTION_RUN_SYNC = "podcast_sync_run";
export const PODCAST_SYNC_PAGE_PATH = "/podcast-sync";

export type Surface = "page" | "widget";

export interface ButtonElement {
	type: "button";
	action_id: string;
	label: string;
	style?: "primary" | "danger" | "secondary";
}

export type LinkTarget =
	| { kind: "external"; url: string }
	| { kind: "plugin-page"; path: string }
	| { kind: "content"; collection: string; id: string };

export interface LinkElement {
	type: "link";
	label: string;
	target: LinkTarget;
	appearance?: "inline" | "primary" | "secondary";
}

export type ActionElement = ButtonElement | LinkElement;

export interface StatItem {
	label: string;
	value: string | number;
	description?: string;
}

export type Block =
	| { type: "header" | "context"; text: string }
	| { type: "divider" }
	| { type: "section"; text: string; accessory?: LinkElement }
	| { type: "actions"; elements: ActionElement[] }
	| { type: "banner"; title?: string; description?: string; variant?: "default" | "alert" | "error" }
	| { type: "stats"; items: StatItem[] };

export interface BlockToast {
	message: string;
	type: "success" | "error" | "info";
}

export interface BlockResponse {
	blocks: Block[];
	toast?: BlockToast;
}

export interface IdleInfo {
	rssDisplayUrl: string;
	existingCount: number | null;
}

const MAX_PAGE_ITEMS = 25;
const MAX_WIDGET_ITEMS = 5;
const MAX_ERROR_LEN = 300;

function actionElements(surface: Surface): ActionElement[] {
	const elements: ActionElement[] = [
		{
			type: "button",
			action_id: ACTION_CHECK_RSS,
			label: "Check RSS (dry run)",
			style: "secondary",
		},
		{
			type: "button",
			action_id: ACTION_RUN_SYNC,
			label: "Sync new episodes",
			style: "primary",
		},
	];
	if (surface === "widget") {
		elements.push({
			type: "link",
			label: "Open full view",
			target: { kind: "plugin-page", path: PODCAST_SYNC_PAGE_PATH },
		});
	}
	return elements;
}

function formatDateShort(iso: string): string {
	return iso.slice(0, 10);
}

/** Sanitizes error text before rendering to Block Kit so credentials/connection strings never leak. */
export function sanitizeErrorMessage(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err);
	const singleLine = raw.split(/\r?\n/)[0]?.trim() || "Unknown error";
	// Redact any URL credentials or postgres connection strings if an upstream driver error included them.
	const scrubbed = singleLine
		.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-db-url]")
		.replace(/(https?:\/\/)([^/\s@]+)@/gi, "$1[redacted]@");
	return scrubbed.length > MAX_ERROR_LEN ? `${scrubbed.slice(0, MAX_ERROR_LEN - 3)}...` : scrubbed;
}

export function renderIdleBlocks(surface: Surface, info: IdleInfo): BlockResponse {
	const countText =
		info.existingCount === null
			? "Unable to read current Podcasts count."
			: `${info.existingCount} episode${info.existingCount === 1 ? "" : "s"} currently in EmDash.`;

	if (surface === "widget") {
		return {
			blocks: [
				{
					type: "context",
					text: `Pull latest Spotify episodes from RSS into Podcasts. ${countText}`,
				},
				{ type: "actions", elements: actionElements("widget") },
			],
		};
	}

	const blocks: Block[] = [
		{ type: "header", text: "Spotify Podcast Sync" },
		{
			type: "section",
			text: "Pull new episodes from the Spotify/Anchor RSS feed into the **Podcasts** collection. Existing episodes (published and drafts) are matched by `legacy_id` and are never overwritten.",
		},
		{
			type: "context",
			text: `Feed: ${info.rssDisplayUrl} · ${countText}`,
		},
		{ type: "actions", elements: actionElements("page") },
	];

	return { blocks };
}

export function renderBusyBlocks(surface: Surface, info: IdleInfo): BlockResponse {
	const message = "A podcast sync is already running. Please wait a moment and try again.";
	const base = renderIdleBlocks(surface, info);
	return {
		blocks: [
			{
				type: "banner",
				title: "Sync already in progress",
				description: message,
				variant: "alert",
			},
			...base.blocks,
		],
		toast: { message, type: "info" },
	};
}

export function renderErrorBlocks(surface: Surface, error: unknown, info: IdleInfo): BlockResponse {
	const message = sanitizeErrorMessage(error);
	const blocks: Block[] = [];

	if (surface === "page") {
		blocks.push({ type: "header", text: "Spotify Podcast Sync" });
	}
	blocks.push({
		type: "banner",
		title: "Podcast sync failed",
		description: message,
		variant: "error",
	});
	blocks.push({
		type: "context",
		text: `Feed: ${info.rssDisplayUrl}`,
	});
	blocks.push({ type: "actions", elements: actionElements(surface) });

	return {
		blocks,
		toast: { message: `Podcast sync failed: ${message}`, type: "error" },
	};
}

export function renderSyncResultBlocks(surface: Surface, result: SyncResult): BlockResponse {
	const isDryRun = result.mode === "dry_run";
	const n = result.created.length;
	const episodeWord = n === 1 ? "episode" : "episodes";

	const headline = isDryRun
		? n > 0
			? `Dry run: ${n} new ${episodeWord} ready to import`
			: "Dry run: already up to date"
		: n > 0
			? `Synced ${n} new ${episodeWord}`
			: "Already up to date";

	const description = isDryRun
		? n > 0
			? `No changes were written. Click "Sync new episodes" to create and publish these ${n} ${episodeWord}.`
			: `All ${result.alreadyPresent} feed episodes are already in EmDash (${result.skipped.length} skipped).`
		: n > 0
			? `Created and published ${n} new ${episodeWord} from "${result.channelTitle}". Existing episodes were untouched.`
			: `No new episodes to import (${result.alreadyPresent} already in EmDash, ${result.skipped.length} skipped).`;

	const blocks: Block[] = [];

	if (surface === "page") {
		blocks.push({ type: "header", text: "Spotify Podcast Sync" });
		blocks.push({
			type: "context",
			text: `Feed: ${result.rssUrl} · Checked ${result.checkedAt}`,
		});
	}

	blocks.push({
		type: "banner",
		title: headline,
		description,
		variant: "default",
	});

	blocks.push({
		type: "stats",
		items: [
			{ label: "In RSS", value: result.totalInFeed },
			{ label: "Already in CMS", value: result.alreadyPresent },
			{ label: isDryRun ? "New to import" : "Imported", value: n },
			{ label: "Skipped", value: result.skipped.length },
		],
	});

	blocks.push({ type: "actions", elements: actionElements(surface) });

	const maxItems = surface === "widget" ? MAX_WIDGET_ITEMS : MAX_PAGE_ITEMS;

	if (n > 0) {
		blocks.push({ type: "divider" });
		blocks.push({
			type: "context",
			text: isDryRun ? "Episodes that would be imported:" : "Imported episodes:",
		});
		const visible = result.created.slice(0, maxItems);
		for (const ep of visible) {
			const accessory: LinkElement | undefined =
				surface === "page" && ep.entryId
					? {
							type: "link",
							label: "Edit",
							target: { kind: "content", collection: "podcasts", id: ep.entryId },
						}
					: undefined;
			blocks.push({
				type: "section",
				text: `**${ep.title}** (${formatDateShort(ep.pubDate)} · \`${ep.id}\`)`,
				...(accessory ? { accessory } : {}),
			});
		}
		if (n > maxItems) {
			blocks.push({
				type: "context",
				text: `...and ${n - maxItems} more episode${n - maxItems === 1 ? "" : "s"}.`,
			});
		}
	}

	if (result.skipped.length > 0) {
		blocks.push({ type: "divider" });
		const visibleSkipped = result.skipped.slice(0, maxItems);
		const summaryLines = visibleSkipped.map((s) => `- ${s.title} (${s.id}): ${s.reason}`);
		if (result.skipped.length > maxItems) {
			summaryLines.push(`- ...and ${result.skipped.length - maxItems} more skipped`);
		}
		blocks.push({
			type: "banner",
			title: `Skipped ${result.skipped.length} episode${result.skipped.length === 1 ? "" : "s"}`,
			description: summaryLines.join("\n"),
			variant: "alert",
		});
	}

	if (result.driftWarnings.length > 0) {
		blocks.push({ type: "divider" });
		blocks.push({
			type: "banner",
			title: "RSS channel metadata drift detected",
			description: result.driftWarnings.join("\n"),
			variant: "alert",
		});
	}

	return {
		blocks,
		toast: {
			message: headline,
			type: isDryRun ? "info" : "success",
		},
	};
}
