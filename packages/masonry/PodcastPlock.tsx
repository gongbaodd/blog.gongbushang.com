import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Button, Center, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import {
  $episodes,
  $loading,
  streamPodcastEpisodes,
  type IPodcastEpisode,
} from "../../src/stores/podcast";
import { SsrMasonry } from "./SsrMasonry";
import { RevealCard } from "@/packages/card/RevealCard";
import {
  CardSkeleton,
  isSkeletonItem,
  skeletonItems,
  type ISkeletonItem,
} from "@/packages/card/CardSkeletons";
import { PodcastEpisodeCard } from "@/packages/card/PodcastEpisodeCard";
import { useCallback, useEffect } from "react";
import type { IPost } from "@/packages/card/PostCard";

const PODCAST_KEY = "podcast";

/** Map a blog post with category podcast to IPodcastEpisode for PodcastEpisodeCard */
export function postToEpisode(post: IPost): IPodcastEpisode {
  const data = post.data as Record<string, unknown> | undefined;
  const cover = post.data?.cover;
  const image =
    (data?.image as string) ??
    (typeof cover?.url === "string" ? cover.url : (cover?.url as { src?: string })?.src);
  const colorSetRaw =
    (data?.colorSet as { bgColor?: string; titleColor?: string } | undefined) ??
    (post.data?.bgColor && post.data?.titleColor
      ? { bgColor: post.data.bgColor, titleColor: post.data.titleColor }
      : undefined);
  const colorSet =
    colorSetRaw?.bgColor && colorSetRaw?.titleColor
      ? { bgColor: colorSetRaw.bgColor, titleColor: colorSetRaw.titleColor }
      : undefined;
  return {
    id: post.id,
    title: post.title,
    link: (data?.link as string) ?? post.href,
    pubDate: typeof post.date === "string" ? post.date : new Date(post.date).toISOString(),
    summary: (data?.summary as string) ?? post.excerpt,
    description: (data?.description as string) ?? post.excerpt,
    duration: data?.duration as string | undefined,
    audioUrl: data?.audioUrl as string | undefined,
    image,
    colorSet,
  };
}

export function PodcastCardFromPost({
  post,
  hideExcerpt,
  fill,
}: {
  post: IPost;
  hideExcerpt?: boolean;
  fill?: boolean;
}) {
  return <PodcastEpisodeCard episode={postToEpisode(post)} hideExcerpt={hideExcerpt} fill={fill} />;
}

export interface IPodcastPlockProps {
  totalCount: number;
  /** First episodes rendered into the server HTML; the rest is streamed after mount. */
  initialEpisodes?: IPodcastEpisode[];
}

export default function PodcastPlock({ totalCount, initialEpisodes }: IPodcastPlockProps) {
  // Seed before the first render so the client's first output equals the server HTML.
  if (initialEpisodes?.length && !$episodes.get()[PODCAST_KEY]) {
    $episodes.setKey(PODCAST_KEY, initialEpisodes);
  }
  const episodes = useStore($episodes)[PODCAST_KEY] ?? [];
  const isLoading = useStore($loading);
  const hasMore = episodes.length < totalCount;
  // While a page streams in, placeholder cards occupy the next masonry slots.
  const items: (IPodcastEpisode | ISkeletonItem)[] =
    isLoading && hasMore ? [
          ...episodes,
          ...skeletonItems(episodes.map((e) => ({ ...e.colorSet }))),
        ] : episodes;

  useEffect(() => {
    if (episodes.length < totalCount) streamPodcastEpisodes();
  }, []);

  const loadMore = useCallback(() => {
    streamPodcastEpisodes();
  }, []);

  return (
    <CustomMantineProvider>
      <Stack mih="100vh">
        <SsrMasonry
          items={items}
          render={(episode) =>
            isSkeletonItem(episode) ? (
              <CardSkeleton
                key={`sk-${episode.skeleton}`}
                seed={episode.skeleton + 1}
                bgColor={episode.bgColor}
                titleColor={episode.titleColor}
              />
            ) : (
              <RevealCard key={episode.id} id={episode.id}>
                <PodcastEpisodeCard episode={episode} fill />
              </RevealCard>
            )
          }
        />
        {hasMore && !isLoading && (
          <Center w="100%" pt="xl">
            <Button variant="default" onClick={loadMore}>
              Load More
            </Button>
          </Center>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}
