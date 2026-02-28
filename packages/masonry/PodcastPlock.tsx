import { Masonry } from "react-plock";
import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Button, Center, Loader, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { $episodes, $loading, streamPodcastEpisodes } from "../../src/stores/podcast";
import { PodcastEpisodeCard } from "@/packages/card/PodcastEpisodeCard";
import { useCallback, useEffect } from "react";

const PODCAST_KEY = "podcast";

export interface IPodcastPlockProps {
  totalCount: number;
}

export default function PodcastPlock({ totalCount }: IPodcastPlockProps) {
  const episodes = useStore($episodes)[PODCAST_KEY] ?? [];
  const isLoading = useStore($loading);
  const hasMore = episodes.length < totalCount;

  const columns = [1, 2, 3, 4, 5];

  useEffect(() => {
    streamPodcastEpisodes();
  }, []);

  const loadMore = useCallback(() => {
    streamPodcastEpisodes();
  }, []);

  return (
    <CustomMantineProvider>
      <Stack mih="100vh">
        <Masonry
          items={episodes}
          config={{
            columns,
            gap: [48, 16, 32, 32, 32],
            media: [28, 48, 75, 88, 110].map((i) => i * 16),
          }}
          render={(episode) => (
            <PodcastEpisodeCard key={episode.id} episode={episode} />
          )}
        />
        {hasMore && (
          <Center w="100%" pt="xl">
            {isLoading ? (
              <Button
                variant="default"
                leftSection={<Loader size="xs" c="dimmed" />}
              >
                Loading
              </Button>
            ) : (
              <Button variant="default" onClick={loadMore}>
                Load More
              </Button>
            )}
          </Center>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}
