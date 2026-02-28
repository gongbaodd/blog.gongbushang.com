import {
  Badge,
  Card,
  Group,
  Stack,
  Text,
  Title,
  Anchor,
  Skeleton,
} from "@mantine/core";
import { useEffect, useState } from "react";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface IPodcastEpisode {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  summary?: string;
  description?: string;
  duration?: string;
  audioUrl?: string;
  image?: string;
}

interface IPodcastChannel {
  title: string;
  description: string;
  link: string;
  image?: string;
}

interface IPodcastData {
  channel: IPodcastChannel;
  episodes: IPodcastEpisode[];
}

export default function PodcastList() {
  const [data, setData] = useState<IPodcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/podcast/all.json");
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const json = (await res.json()) as IPodcastData;
        setData(json);
      } catch (err) {
        console.error(err);
        setError("Failed to load podcast episodes.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <CustomMantineProvider>
      <Stack gap="xl">
        {loading && (
          <Stack gap="md">
            <Skeleton height={28} width="50%" />
            <Skeleton height={16} width="70%" />
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </Stack>
        )}

        {!loading && error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        {!loading && !error && data && (
          <>
            <Stack gap="xs">
              <Title order={2}>{data.channel.title}</Title>
              {data.channel.description && (
                <Text size="sm" c="dimmed">
                  {data.channel.description}
                </Text>
              )}
            </Stack>

            <Stack gap="md">
              {data.episodes.map((episode) => (
                <Card key={episode.id} withBorder radius="md" shadow="sm">
                  <Stack gap="xs">
                    <Group justify="space-between" align="baseline">
                      <Anchor href={episode.link} target="_blank">
                        <Title order={3} size="h4">
                          {episode.title}
                        </Title>
                      </Anchor>
                      {episode.duration && (
                        <Badge variant="light" radius="sm">
                          {episode.duration}
                        </Badge>
                      )}
                    </Group>
                    {episode.pubDate && (
                      <Text size="xs" c="dimmed">
                        {new Date(episode.pubDate).toLocaleString()}
                      </Text>
                    )}
                    {(episode.summary || episode.description) && (
                      <Text size="sm" lineClamp={3}>
                        {episode.summary || episode.description}
                      </Text>
                    )}
                    <Group gap="sm">
                      {episode.audioUrl && (
                        <Anchor href={episode.audioUrl} target="_blank">
                          Listen
                        </Anchor>
                      )}
                      <Anchor href={episode.link} target="_blank">
                        View on Spotify
                      </Anchor>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}

