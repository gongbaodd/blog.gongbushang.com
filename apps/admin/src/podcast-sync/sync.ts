/**
 * Idempotent RSS -> EmDash `podcasts` sync logic.
 *
 * Semantics mirror `apps/web/scripts/podcast/emdash.ts`:
 * - Matches existing entries across ALL non-deleted statuses (published, draft, scheduled) by `legacy_id`.
 * - Never overwrites existing entries so edits made in Admin survive.
 * - Skips episodes whose `pubDate` does not parse (never writes `pub_date: null`).
 * - Checks channel metadata against `apps/web/src/lib/podcast-channel.ts` and surfaces drift warnings.
 * - Creates via `ctx.content.create` (without `slug`, which EmDash rejects on plugin create) and publishes via
 *   `getVersioned` + `publish({ _rev })`.
 * - Coalesces rebuild dispatches: suppresses per-item `content:afterPublish` dispatches for synced IDs and triggers
 *   a single GitHub `repository_dispatch` at the end when at least one episode was published.
 */
import { PODCAST_CHANNEL } from "../../../web/src/lib/podcast-channel.ts";
import {
	consumeSuppressedPublishDispatch,
	dispatchFromNodeEnv,
	suppressPublishDispatch,
	type Logger,
	type PublishInfo,
} from "../rebuild-on-publish.ts";
import {
	fetchRssFeed,
	redactRssUrlForDisplay,
	resolveRssUrl,
	type ChannelData,
	type ParsedFeed,
	type RssEpisode,
} from "./rss.ts";

export interface PodcastContentItem {
	id: string;
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
}

export interface PodcastContentClient {
	list(
		collection: string,
		options?: { limit?: number; cursor?: string },
	): Promise<{
		items: PodcastContentItem[];
		cursor?: string;
		hasMore: boolean;
	}>;
	create?(collection: string, data: Record<string, unknown>): Promise<PodcastContentItem>;
	getVersioned?(
		collection: string,
		id: string,
	): Promise<{ item: PodcastContentItem; _rev: string } | null>;
	publish?(
		collection: string,
		id: string,
		options: { _rev: string },
	): Promise<{ item: PodcastContentItem; _rev: string }>;
}

export interface SyncEpisodeSummary {
	id: string;
	title: string;
	pubDate: string;
	entryId?: string;
}

export interface SkippedEpisode {
	id: string;
	title: string;
	reason: string;
}

export interface SyncResult {
	mode: "dry_run" | "sync";
	rssUrl: string;
	channelTitle: string;
	totalInFeed: number;
	existingInCms: number;
	alreadyPresent: number;
	created: SyncEpisodeSummary[];
	skipped: SkippedEpisode[];
	driftWarnings: string[];
	rebuildDispatched: boolean;
	checkedAt: string;
}

export interface SyncPodcastsOptions {
	content: PodcastContentClient;
	dryRun: boolean;
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
	log?: Logger;
	now?: Date;
	timeoutMs?: number;
	maxBytes?: number;
	/** Test seam for feed fetching. */
	fetchFeed?: (url: string, allowLocalHttp: boolean) => Promise<ParsedFeed>;
	/** Test seam for per-item dispatch suppression. */
	suppressDispatch?: (collection: string, id: string) => void;
	/** Test seam for clearing a suppression marker when publish throws. */
	clearSuppressedDispatch?: (collection: string, id: string) => void;
	/** Test seam for final single rebuild dispatch. */
	dispatchRebuild?: (
		info: PublishInfo,
		log: Logger,
		env: NodeJS.ProcessEnv,
		fetchImpl: typeof fetch,
	) => Promise<void>;
}

const NOOP_LOGGER: Logger = {
	info() {},
	warn() {},
	error() {},
};

/** ISO form of the RSS pubDate, or undefined when empty or unparseable (never writes `pub_date: null`). */
export function pubDateIso(ep: Pick<RssEpisode, "pubDate">): string | undefined {
	const raw = ep.pubDate?.trim();
	if (!raw) return undefined;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Warnings for RSS channel fields that differ from `apps/web/src/lib/podcast-channel.ts`. */
export function channelDrift(channel: Pick<ChannelData, "title" | "description" | "image">): string[] {
	const out: string[] = [];
	for (const k of ["title", "description", "image"] as const) {
		if (channel[k] !== PODCAST_CHANNEL[k]) {
			out.push(
				`RSS channel ${k} differs from podcast-channel.ts: ${JSON.stringify(channel[k])} (site constant: ${JSON.stringify(PODCAST_CHANNEL[k])})`,
			);
		}
	}
	return out;
}

/**
 * Normalizes optional EmDash `type: "url"` field values: returns `null` unless the input is a parseable
 * `http:`/`https:` URL without ASCII control characters (prevents `VALIDATION_ERROR` on non-URL `<guid>` or bad RSS URLs).
 */
export function normalizeUrlField(raw: string | undefined): string | null {
	const trimmed = raw?.trim();
	if (!trimmed) return null;
	if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return null;
	}
	return trimmed;
}

/**
 * Maps an RSS episode to `podcasts` collection fields (schema: `apps/web/scripts/schema/apply.mjs`).
 * Deliberately omits `slug`: `ctx.content.create` rejects unknown keys; `legacy_id` drives `/podcast/<id>/` and derive keys.
 */
export function episodeToFields(ep: RssEpisode): Record<string, unknown> {
	const pub = pubDateIso(ep);
	return {
		title: ep.title,
		legacy_id: ep.id,
		link: normalizeUrlField(ep.link),
		...(pub ? { pub_date: pub } : {}),
		description: ep.description,
		summary: ep.summary,
		duration: ep.duration,
		audio_url: normalizeUrlField(ep.audioUrl),
		image_url: normalizeUrlField(ep.image),
	};
}

/**
 * Paginates through all non-deleted `podcasts` entries (published, draft, scheduled) and collects `legacy_id` values.
 * EmDash clamps `limit` to 100, so cursor pagination is required once there are >100 episodes.
 */
export async function listExistingLegacyIds(
	content: PodcastContentClient,
): Promise<{ legacyIds: Set<string>; totalEntries: number }> {
	const legacyIds = new Set<string>();
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	let totalEntries = 0;

	while (true) {
		const page = await content.list("podcasts", { limit: 100, ...(cursor ? { cursor } : {}) });
		for (const item of page.items) {
			totalEntries++;
			const legacyId = item.data?.legacy_id;
			if (typeof legacyId === "string" && legacyId.trim().length > 0) {
				legacyIds.add(legacyId.trim());
			}
		}
		if (!page.hasMore || !page.cursor || seenCursors.has(page.cursor)) {
			break;
		}
		seenCursors.add(page.cursor);
		cursor = page.cursor;
	}

	return { legacyIds, totalEntries };
}

export async function syncPodcasts(options: SyncPodcastsOptions): Promise<SyncResult> {
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const log = options.log ?? NOOP_LOGGER;
	const now = options.now ?? new Date();
	const suppress = options.suppressDispatch ?? suppressPublishDispatch;
	const clearSuppressed = options.clearSuppressedDispatch ?? consumeSuppressedPublishDispatch;
	const dispatchRebuild = options.dispatchRebuild ?? dispatchFromNodeEnv;

	const { url, allowLocalHttp } = resolveRssUrl(env);
	const feed = options.fetchFeed
		? await options.fetchFeed(url, allowLocalHttp)
		: await fetchRssFeed(url, {
				fetchImpl,
				allowLocalHttp,
				timeoutMs: options.timeoutMs,
				maxBytes: options.maxBytes,
			});

	const driftWarnings = channelDrift(feed.channel);
	for (const warning of driftWarnings) {
		log.warn(`podcast-sync: ${warning}`);
	}

	const existing = await listExistingLegacyIds(options.content);
	const seenInFeed = new Set<string>();
	const created: SyncEpisodeSummary[] = [];
	const skipped: SkippedEpisode[] = [];
	let alreadyPresent = 0;
	let rebuildDispatched = false;

	if (!options.dryRun) {
		if (!options.content.create || !options.content.getVersioned || !options.content.publish) {
			throw new Error("Podcast sync plugin lacks required content write/publish capabilities.");
		}
	}

	try {
		for (const ep of feed.episodes) {
			if (existing.legacyIds.has(ep.id)) {
				alreadyPresent++;
				continue;
			}
			if (seenInFeed.has(ep.id)) {
				skipped.push({
					id: ep.id,
					title: ep.title,
					reason: "Duplicate episode ID in RSS feed",
				});
				continue;
			}
			seenInFeed.add(ep.id);

			const pub = pubDateIso(ep);
			if (!pub) {
				const reason = ep.pubDate
					? `Unparseable pubDate (${JSON.stringify(ep.pubDate)})`
					: "Missing pubDate";
				log.warn(`podcast-sync: skipping "${ep.title}" (${ep.id}): ${reason}`);
				skipped.push({ id: ep.id, title: ep.title, reason });
				continue;
			}

			if (options.dryRun) {
				created.push({ id: ep.id, title: ep.title, pubDate: pub });
				continue;
			}

			const draft = await options.content.create!("podcasts", episodeToFields(ep));
			const versioned = await options.content.getVersioned!("podcasts", draft.id);
			if (!versioned) {
				throw new Error(`Could not load revision for newly created episode "${ep.title}" (${draft.id}).`);
			}

			suppress("podcasts", draft.id);
			try {
				await options.content.publish!("podcasts", draft.id, { _rev: versioned._rev });
			} catch (err) {
				clearSuppressed("podcasts", draft.id);
				throw err;
			}

			created.push({ id: ep.id, title: ep.title, pubDate: pub, entryId: draft.id });
			log.info(`podcast-sync: imported and published "${ep.title}" (${ep.id})`);
		}
	} finally {
		if (!options.dryRun && created.length > 0) {
			const last = created[created.length - 1]!;
			await dispatchRebuild(
				{
					collection: "podcasts",
					id: last.entryId ?? last.id,
					slug: last.id,
				},
				log,
				env,
				fetchImpl,
			);
			rebuildDispatched = true;
		}
	}

	return {
		mode: options.dryRun ? "dry_run" : "sync",
		rssUrl: redactRssUrlForDisplay(url),
		channelTitle: feed.channel.title,
		totalInFeed: feed.episodes.length,
		existingInCms: existing.totalEntries + (options.dryRun ? 0 : created.length),
		alreadyPresent,
		created,
		skipped,
		driftWarnings,
		rebuildDispatched,
		checkedAt: now.toISOString(),
	};
}
