// Podcast data access for /podcast/ and /podcast/<id>/. Episodes live in the EmDash `podcasts` collection (MIG-3) and
// reach the pages through the derive step (scripts/derive/index.ts -> src/generated/legacy-data.json), which adds the
// embedding-derived data (nearest episodes, UMAP). Prerender runs in workerd and cannot query the database itself.
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
}: PodcastEpisode): IPodcastEpisode => ({
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
});

/**
 * The show itself (not an episode): constant, as in the legacy `podcast.json` channel. EmDash has no singleton
 * entry for it and it has not changed in years; edit here if the show moves (fetch-podcast does not touch it in
 * `--emdash` mode).
 */
const CHANNEL: PodcastChannel = {
  title: "给我整 growgen",
  description:
    "我是一个旅居爱沙尼亚的中国程序员，我在这里分享每周的编程经验和生活经历，内容是宁滥勿缺，所以想听的听，不想听的别听。",
  link: "https://podcasters.spotify.com/pod/show/growgen",
  image:
    "https://d3t3ozftmdmh3i.cloudfront.net/staging/podcast_uploaded_nologo/40922820/40922820-1754219676687-e0d3d11be8014.jpg",
};

export const getPodcastChannel = (): PodcastChannel => CHANNEL;

/** Newest first. */
export const getPodcastEpisodes = (): PodcastEpisode[] => legacy.podcast;

export function getPodcastRelated(id: string): PodcastEpisode[] {
  const byId = new Map(legacy.podcast.map((e) => [e.id, e]));
  return (legacy.podcastRelated[id] ?? []).flatMap((rid) => byId.get(rid) ?? []);
}
