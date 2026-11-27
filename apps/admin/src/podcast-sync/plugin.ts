/**
 * `podcast-sync` EmDash native plugin (GON-265): one-click dry-run check and sync of the latest
 * Spotify/Anchor RSS episodes into the EmDash `podcasts` collection.
 *
 * Exposes an Admin sidebar page (`/podcast-sync`) and a compact dashboard widget (`podcast-sync`),
 * both rendered with EmDash Block Kit (zero custom React or browser bundle changes).
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type PluginDescriptor } from "emdash";
import type { Logger, PublishInfo } from "../rebuild-on-publish.ts";
import {
	ACTION_CHECK_RSS,
	ACTION_RUN_SYNC,
	PODCAST_SYNC_PAGE_PATH,
	renderBusyBlocks,
	renderErrorBlocks,
	renderIdleBlocks,
	renderSyncResultBlocks,
	type BlockResponse,
	type Surface,
} from "./blocks.ts";
import { DEFAULT_RSS_URL, redactRssUrlForDisplay, resolveRssUrl, type ParsedFeed } from "./rss.ts";
import { listExistingLegacyIds, syncPodcasts, type PodcastContentClient } from "./sync.ts";

export const PLUGIN_ID = "podcast-sync";
const VERSION = "0.1.0";
const PAGES = [{ path: PODCAST_SYNC_PAGE_PATH, label: "Podcast sync", icon: "radio" }];
const WIDGETS = [{ id: "podcast-sync", title: "Podcast sync", size: "half" as const }];

export interface PodcastSyncPluginOptions {
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	now?: () => Date;
	timeoutMs?: number;
	maxBytes?: number;
	fetchFeed?: (url: string, allowLocalHttp: boolean) => Promise<ParsedFeed>;
	suppressDispatch?: (collection: string, id: string) => void;
	dispatchRebuild?: (
		info: PublishInfo,
		log: Logger,
		env: NodeJS.ProcessEnv,
		fetchImpl: typeof fetch,
	) => Promise<void>;
}

export interface AdminRouteContextLike {
	input: unknown;
	content?: PodcastContentClient;
	log: Logger;
	ui?: { surface?: string };
}

interface ActionInput {
	type?: unknown;
	action_id?: unknown;
	page?: unknown;
}

function detectSurface(ctx: Pick<AdminRouteContextLike, "input" | "ui">): Surface {
	if (ctx.ui?.surface === "dashboard-widget") return "widget";
	const page = (ctx.input as ActionInput | null)?.page;
	if (typeof page === "string" && page.startsWith("widget:")) return "widget";
	return "page";
}

function safeDisplayRssUrl(env: NodeJS.ProcessEnv): string {
	try {
		return redactRssUrlForDisplay(resolveRssUrl(env).url);
	} catch {
		return DEFAULT_RSS_URL;
	}
}

export function createAdminRouteHandler(options: PodcastSyncPluginOptions = {}) {
	let syncInFlight = false;

	return async function handleAdminRoute(ctx: AdminRouteContextLike): Promise<BlockResponse> {
		const env = options.env ?? process.env;
		const surface = detectSurface(ctx);
		const input = (ctx.input && typeof ctx.input === "object" ? ctx.input : {}) as ActionInput;
		const rssDisplayUrl = safeDisplayRssUrl(env);

		const isAction = input.type === "block_action" && typeof input.action_id === "string";

		if (isAction && (input.action_id === ACTION_CHECK_RSS || input.action_id === ACTION_RUN_SYNC)) {
			if (!ctx.content) {
				return renderErrorBlocks(surface, new Error("EmDash content API is unavailable for this plugin."), {
					rssDisplayUrl,
					existingCount: null,
				});
			}
			const dryRun = input.action_id === ACTION_CHECK_RSS;

			if (!dryRun && syncInFlight) {
				return renderBusyBlocks(surface, { rssDisplayUrl, existingCount: null });
			}

			if (!dryRun) syncInFlight = true;
			try {
				const result = await syncPodcasts({
					content: ctx.content,
					dryRun,
					env,
					fetchImpl: options.fetchImpl,
					log: ctx.log,
					now: options.now ? options.now() : new Date(),
					timeoutMs: options.timeoutMs,
					maxBytes: options.maxBytes,
					fetchFeed: options.fetchFeed,
					suppressDispatch: options.suppressDispatch,
					dispatchRebuild: options.dispatchRebuild,
				});
				return renderSyncResultBlocks(surface, result);
			} catch (err) {
				ctx.log.error("podcast-sync: action failed", err instanceof Error ? err.message : String(err));
				return renderErrorBlocks(surface, err, { rssDisplayUrl, existingCount: null });
			} finally {
				if (!dryRun) syncInFlight = false;
			}
		}

		// Initial page_load / widget load (or unknown action)
		let existingCount: number | null = null;
		if (ctx.content) {
			try {
				const existing = await listExistingLegacyIds(ctx.content);
				existingCount = existing.totalEntries;
			} catch (err) {
				ctx.log.warn("podcast-sync: failed to count existing podcasts", err instanceof Error ? err.message : String(err));
			}
		}

		return renderIdleBlocks(surface, { rssDisplayUrl, existingCount });
	};
}

export function createPlugin(options: PodcastSyncPluginOptions = {}) {
	const handler = createAdminRouteHandler(options);
	return definePlugin({
		id: PLUGIN_ID,
		displayName: "Podcast sync",
		description: "Pull latest Spotify/Anchor RSS episodes into the Podcasts collection.",
		version: VERSION,
		capabilities: ["content:read", "content:write", "content:publish"],
		admin: { pages: PAGES, widgets: WIDGETS },
		routes: {
			admin: {
				handler: async (routeCtx) =>
					handler({
						input: routeCtx.input,
						content: routeCtx.content,
						log: routeCtx.log,
						ui: routeCtx.ui,
					}),
			},
		},
	});
}

export function podcastSync(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminPages: PAGES,
		adminWidgets: WIDGETS,
	};
}

export default createPlugin;
