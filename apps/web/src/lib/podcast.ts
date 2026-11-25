// Podcast data access for /podcast/ and /podcast/<id>/. Episodes live in the EmDash `podcasts` collection (MIG-3) and
// reach the pages through the derive step (scripts/derive/index.ts -> src/generated/legacy-data.json), which adds the
// embedding-derived data (nearest episodes, UMAP). Prerender runs in workerd and cannot query the database itself.
import { PODCAST_CHANNEL } from "./podcast-channel";
import { legacy, type PodcastChannel, type PodcastEpisode } from "./legacy-data";
import type { IPodcastEpisode } from "../stores/podcast";

/** Only the fields the cards render: episodes also carry large `embeddings`/`umap2D` data. */
export const slimEpisode = ({
	id,
	title,
	link,
	pubDate,
	summary,
	description,
	duration,
	audioUrl,
	image,
	colorSet,
}: PodcastEpisode): IPodcastEpisode => ({ id, title, link, pubDate, summary, description, duration, audioUrl, image, colorSet });

/** The show itself: see ./podcast-channel.ts (fetch-podcast --emdash warns when the RSS channel drifts from it). */
const CHANNEL: PodcastChannel = PODCAST_CHANNEL;

export const getPodcastChannel = (): PodcastChannel => CHANNEL;

/** Newest first. */
export const getPodcastEpisodes = (): PodcastEpisode[] => legacy.podcast;

export function getPodcastRelated(id: string): PodcastEpisode[] {
	const byId = new Map(legacy.podcast.map((e) => [e.id, e]));
	return (legacy.podcastRelated[id] ?? []).flatMap((rid) => byId.get(rid) ?? []);
}
