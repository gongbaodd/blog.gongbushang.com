import { date, excerpt, title } from "@/packages/utils/extract";
import { ActionIcon, Anchor, Avatar, Badge, Box, Card, Divider, Flex, Group, MantineProvider, Stack, Text } from "@mantine/core";
import { IconBookmark, IconCalendar, IconHeart, IconMessageCircle, IconShare } from "@tabler/icons-react";
import type { CollectionEntry } from "astro:content";

export default function BlogCard({ post, index }: { post: CollectionEntry<"blog">, index?: number }) {
  return (
  <MantineProvider>
    <Card key={post.id} shadow="sm" padding="lg" radius="md" withBorder>
      <Flex gap="md" align="center" justify="center">
        {/* Avatar/Thumbnail */}
        <Box>
          <Avatar size={128} radius="md">
            {title(post).charAt(0)}
          </Avatar>
        </Box>
      </Flex>

      <Box style={{ flex: 1, minWidth: 0 }}>
        <Stack gap="sm">
          <Box>
            <Anchor
              component="button"
              fw={700}
              size="lg"
              c={"light"}
              style={{
                textAlign: "left",
                textDecoration: "none",
              }}
              onClick={() => {}}
            >
              {title(post)}
            </Anchor>
            <Group gap="md" mt="xs">
              <Group gap="xs">
                <IconCalendar size={14} color="var(--mantine-color-gray-6)" />
                <Text size="sm" c="dimmed">
                  {date(post).toISOString()}
                </Text>
              </Group>
              <Badge color="blue" variant="light" size="sm">
                {post.data.category}
              </Badge>
            </Group>
          </Box>

          <Text c="dimmed" size="sm" lineClamp={3}>
            {excerpt(post)}
          </Text>

          <Group gap="xs">
            {post.data.tag?.map((tag) => (
              <Badge key={tag} color="gray" variant="outline" size="xs">
                #{tag}
              </Badge>
            ))}
          </Group>

          <Divider />

          {/* Actions */}
          <Group justify="space-between">
            <Group gap="lg">
              <Group gap="xs">
                <ActionIcon variant="subtle" color={"red"} size="sm">
                  <IconHeart size={16} fill={"currentColor"} />
                </ActionIcon>
                <Text size="sm" c="dimmed">
                  1
                </Text>
              </Group>

              <Group gap="xs">
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <IconMessageCircle size={16} />
                </ActionIcon>
                <Text size="sm" c="dimmed">
                  comments
                </Text>
              </Group>

              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconShare size={16} />
              </ActionIcon>
            </Group>

            <ActionIcon variant="subtle" color={"yellow"} size="sm">
              <IconBookmark size={16} fill={"currentcolor"} />
            </ActionIcon>
          </Group>
        </Stack>
      </Box>
    </Card>
    </MantineProvider>
  );
}
