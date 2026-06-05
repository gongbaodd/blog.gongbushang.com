import {
  ActionIcon,
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
import { IconPlayerPlay, IconQuoteFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Calendar, Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import type { IPodcastEpisode } from "@/src/stores/podcast";
import classes from "./PostCard.module.css";
import { stripHtml } from "./stripHtml";

interface IPodcastEpisodeCardProps {
  episode: IPodcastEpisode;
  hideExcerpt?: boolean;
}

export function PodcastEpisodeCard({ episode, hideExcerpt }: IPodcastEpisodeCardProps) {
  const excerpt = stripHtml(episode.summary || episode.description || "");
  const [coverOpacity, setCoverOpacity] = useState(0);
  const hasCover = !!episode.image;

  useEffect(() => {
    if (!episode.image) return;
    const img = new Image();
    img.src = episode.image;
    img.onload = () => setCoverOpacity(1);
  }, [episode.image]);

  const className = [
    classes.item,
    hasCover ? classes.with_bg : classes.liquid_cheese,
    classes.md,
  ].join(" ");

  const tracedCover = episode.trace
    ? `url("data:image/svg+xml,${encodeURIComponent(episode.trace)}")`
    : episode.image
      ? `url("data:image/svg+xml,${encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="%23e9ecef" width="100" height="100"/></svg>`
        )}")`
      : "";

  const cardStyle = {
    "--underline-color": episode.colorSet?.titleColor
      ? `var(${episode.colorSet.titleColor})`
      : "var(--mantine-color-dark-8)",
    "--transition-name": "podcast-" + episode.id.replaceAll("/", "-"),
  } as React.CSSProperties;

  const coverAreaStyle = {
    backgroundColor: episode.colorSet?.bgColor || "var(--mantine-color-gray-2)",
    "--cover-opacity": coverOpacity,
    "--cover-image": `url(${episode.image})`,
    "--cover-trace": tracedCover,
  } as React.CSSProperties;

  const badgeRow = (
    <Flex justify="space-between" align="center">
      <Badge color="gray" variant="default" size="sm" className={classes.category}>
        <Group gap={6}>
          <Calendar size={12} />
          <Text size="xs">{dayjs(episode.pubDate).format("YYYY-MM-DD")}</Text>
        </Group>
      </Badge>
      {episode.duration && (
        <Badge color="gray" variant="default" size="sm" className={classes.category}>
          <Group gap={6}>
            <Headphones size={12} />
            <Text size="xs">{episode.duration}</Text>
          </Group>
        </Badge>
      )}
    </Flex>
  );

  const metaRow = episode.audioUrl && (
    <Flex gap="xs" justify="space-between" align="end">
      <Group flex={1} />
      <Group gap="xs" flex={0}>
        <ActionIcon
          component="a"
          href={episode.audioUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Listen"
          variant="default"
          color="gray"
          size="lg"
          radius="xl"
          className={classes.category}
        >
          <IconPlayerPlay size={16} />
        </ActionIcon>
      </Group>
    </Flex>
  );

  const titleBlock = (
    <Anchor underline="never" href={episode.link} target="_blank">
      <Title className={classes.title}>
        <span>{episode.title}</span>
      </Title>
    </Anchor>
  );

  return (
    <CustomMantineProvider>
      <Stack justify="center" align="center">
        <Box maw={360}>
          <Card
            key={episode.id}
            shadow="sm"
            padding={hasCover ? 0 : "lg"}
            radius="lg"
            withBorder
            className={className}
            style={{
              ...cardStyle,
              ...(hasCover
                ? {}
                : {
                    backgroundColor:
                      episode.colorSet?.bgColor || "var(--mantine-color-gray-2)",
                  }),
            }}
          >
            {hasCover ? (
              <>
                <Box className={classes.cover_area} style={coverAreaStyle}>
                  <Flex
                    direction="column"
                    justify="space-between"
                    p="lg"
                    flex={1}
                    className={classes.cover_content}
                  >
                    {badgeRow}
                    {metaRow}
                  </Flex>
                </Box>
                <Box className={classes.cover_footer}>{titleBlock}</Box>
              </>
            ) : (
              <Flex
                direction="column"
                justify="space-between"
                flex={1}
                className={classes.content}
              >
                {badgeRow}
                {titleBlock}
                {episode.audioUrl && (
                  <Group gap="xs">
                    <Anchor href={episode.audioUrl} target="_blank" size="xs">
                      Listen
                    </Anchor>
                  </Group>
                )}
              </Flex>
            )}
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
