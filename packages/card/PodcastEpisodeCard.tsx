import {
  Avatar,
  Badge,
  Box,
  Card,
  Flex,
  Group,
  Stack,
  Text,
  Title,
  Anchor,
} from "@mantine/core";
import { IconQuoteFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Calendar, Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import type { IPodcastEpisode } from "@/src/stores/podcast";
import classes from "./PostCard.module.css";

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface IPodcastEpisodeCardProps {
  episode: IPodcastEpisode;
  hideExcerpt?: boolean;
}

export function PodcastEpisodeCard({ episode, hideExcerpt }: IPodcastEpisodeCardProps) {
  const excerpt = stripHtml(episode.summary || episode.description || "");
  const [coverOpacity, setCoverOpacity] = useState(0);

  useEffect(() => {
    if (!episode.image) return;
    const img = new Image();
    img.src = episode.image;
    img.onload = () => setCoverOpacity(1);
  }, [episode.image]);

  const className = [
    classes.item,
    episode.image ? classes.with_bg : classes.liquid_cheese,
    classes.md,
  ].join(" ");

  const tracedCover = episode.image
    ? `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="%23e9ecef" width="100" height="100"/></svg>`
      )}")`
    : "";

  return (
    <CustomMantineProvider>
      <Stack justify="center" align="center">
        <Box maw={360}>
          <Card
              key={episode.id}
              shadow="sm"
              padding="lg"
              radius="lg"
              withBorder
              className={className}
              style={{
                backgroundColor: "var(--mantine-color-gray-2)",
                "--underline-color": "var(--mantine-color-dark-8)",
                "--cover-opacity": coverOpacity,
                "--cover-image": episode.image ? `url(${episode.image})` : "none",
                "--cover-trace": tracedCover,
                "--transition-name": "podcast-" + episode.id.replaceAll("/", "-"),
              } as React.CSSProperties}
            >
              <Flex
                direction="column"
                justify="space-between"
                flex={1}
                className={classes.content}
              >
                <Flex justify="space-between" align="center">
                  <Badge
                    color="gray"
                    variant="default"
                    size="sm"
                    className={classes.category}
                  >
                    <Group gap={6}>
                      <Calendar size={12} />
                      <Text size="xs">
                        {dayjs(episode.pubDate).format("YYYY-MM-DD")}
                      </Text>
                    </Group>
                  </Badge>
                  {episode.duration && (
                    <Badge
                      color="gray"
                      variant="default"
                      size="sm"
                      className={classes.category}
                    >
                      <Group gap={6}>
                        <Headphones size={12} />
                        <Text size="xs">{episode.duration}</Text>
                      </Group>
                    </Badge>
                  )}
                </Flex>

                <Anchor underline="never" href={episode.link} target="_blank">
                  <Title className={classes.title}>
                    <span>{episode.title}</span>
                  </Title>
                </Anchor>

                <Group gap="xs">
                  <Anchor href={episode.link} target="_blank" size="xs">
                    Spotify
                  </Anchor>
                  {episode.audioUrl && (
                    <Anchor href={episode.audioUrl} target="_blank" size="xs">
                      Listen
                    </Anchor>
                  )}
                </Group>
              </Flex>
            </Card>
          {!hideExcerpt && excerpt && (
            <Flex pl={5} pr={10} pt={5}>
              <Avatar
                size="xs"
                variant="transparent"
                style={{ transform: "rotateZ(180deg)" }}
              >
                <IconQuoteFilled />
              </Avatar>
              <Text size="sm" lineClamp={2} className={classes.excerpt}>
                {excerpt}
              </Text>
            </Flex>
          )}
        </Box>
      </Stack>
    </CustomMantineProvider>
  );
}
