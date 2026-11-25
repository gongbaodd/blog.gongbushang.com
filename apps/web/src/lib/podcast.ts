// Podcast data access for /podcast/ and /podcast/<id>/. Today it reads the legacy snapshot
// (scripts/legacy-data.mjs); MIG-3 imports episodes into EmDash, then only this module changes.
// TODO MIG-3 / PORT-8: swap the source to the EmDash `podcast` collection.
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

const EMPTY_CHANNEL: PodcastChannel = { title: "" };

export const getPodcastChannel = (): PodcastChannel => legacy.podcastChannel ?? EMPTY_CHANNEL;

/** Newest first. */
export const getPodcastEpisodes = (): PodcastEpisode[] => legacy.podcast;

export function getPodcastRelated(id: string): PodcastEpisode[] {
	const byId = new Map(legacy.podcast.map((e) => [e.id, e]));
	return (legacy.podcastRelated[id] ?? []).flatMap((rid) => byId.get(rid) ?? []);
}
