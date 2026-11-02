import {
  Anchor,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { IconCalendar, IconClock, IconExternalLink } from "@tabler/icons-react";
import dayjs from "dayjs";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import classes from "@/packages/content/BlogContent.module.css";

interface IPodcastEpisodeContentProps {
  title: string;
  /** ISO date string. */
  date: string;
  duration?: string;
  image?: string;
  description?: string;
  link?: string;
}

/** Center column of an episode page; mirrors `BlogContent` so both page types look alike. */
export default function PodcastEpisodeContent({
  title,
  date,
  duration,
  image,
  description,
  link,
}: IPodcastEpisodeContentProps) {
  return (
    <CustomMantineProvider>
      <Paper shadow="md" radius="lg" p="xl">
        <Stack gap="xl">
          <Stack gap="lg">
            <Group mb="sm">
              <Anchor href="/podcast">
                <Badge variant="outline">podcast</Badge>
              </Anchor>
            </Group>
            <Group className="prose lg:prose-xl">
              <h1>{title}</h1>
            </Group>
          </Stack>

          <Group justify="space-between" mt={24}>
            <Group>
              <Avatar src="/profile.jpg" size="lg" radius="xl" />
              <div>
                <Text>J.Gong</Text>
                <Group gap="xs">
                  <Group gap={4}>
                    <IconCalendar size={14} />
                    <Text size="sm" c="dimmed">
                      {dayjs(date).format("YYYY-MM-DD")}
                    </Text>
                  </Group>
                  {duration && (
                    <Group gap={4}>
                      <IconClock size={14} />
                      <Text size="sm" c="dimmed">
                        {duration}
                      </Text>
                    </Group>
                  )}
                </Group>
              </div>
            </Group>
          </Group>

          <Divider />
          <Stack className={"prose lg:prose-xl " + classes.content}>
            {image && <img src={image} alt={title} />}
            {description && (
              <p style={{ whiteSpace: "pre-wrap" }}>{description}</p>
            )}
          </Stack>
          {link && (
            <Button
              component="a"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              color="green"
              radius="xl"
              size="md"
              rightSection={<IconExternalLink size={16} />}
              style={{ alignSelf: "flex-start" }}
            >
              Listen on Spotify
            </Button>
          )}
        </Stack>
      </Paper>
    </CustomMantineProvider>
  );
}
