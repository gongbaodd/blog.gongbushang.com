import React, { useEffect, useState, type ReactNode } from "react";
import {
  Paper,
  Title,
  Text,
  Group,
  Avatar,
  Badge,
  Divider,
  Stack,
  ActionIcon,
  Anchor,
  Card,
} from "@mantine/core";
import {
  IconHeart,
  IconShare,
  IconBookmark,
  IconClock,
  IconCalendar,
  IconTag,
  IconList,
} from "@tabler/icons-react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./BlogContent.module.css"
import dayjs from "dayjs"
import type { MarkdownHeading } from "astro";
import { PostCard, type IPost } from "@/packages/card/PostCard";
import { Carousel } from "../carousel/BlogCarousel";
import { useStore } from "@nanostores/react";
import { $isLoading, $relates, request } from "@/src/stores/relates";

interface ILink {
  label: string;
  href: string;
}

interface IProps {
  children: ReactNode;
  title: string;
  links: ILink[];
  date: Date;
  time: string;
}

const BlogContent: React.FC<IProps> = ({ children, title, links, date, time }) => {
  return (
    <CustomMantineProvider>
      <Paper shadow="md" radius="lg" p="xl">
        <Stack gap="xl">
          <Stack gap="lg">
            <Group mb="sm">
              {links.map(({ label, href }) => (
                <Anchor href={href} key={label}>
                  <Badge variant="outline">
                    {label}
                  </Badge>
                </Anchor>
              ))}
            </Group>
            <Group className="prose lg:prose-xl" visibleFrom="md">
              <h1>
                {title}
              </h1>
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
                  <Group gap={4}>
                    <IconClock size={14} />
                    <Text size="sm" c="dimmed">
                      {time}
                    </Text>
                  </Group>
                </Group>
              </div>
            </Group>

            {/* <Group>
              <ActionIcon
                variant={liked ? "filled" : "subtle"}
                color="red"
                size="lg"
                onClick={() => setLiked(!liked)}
              >
                <IconHeart size={20} />
              </ActionIcon>
              <ActionIcon variant="subtle" size="lg">
                <IconShare size={20} />
              </ActionIcon>
              <ActionIcon
                variant={bookmarked ? "filled" : "subtle"}
                size="lg"
                onClick={() => setBookmarked(!bookmarked)}
              >
                <IconBookmark size={20} />
              </ActionIcon>
            </Group> */}
          </Group>

          <Divider />
          <Stack className={"prose lg:prose-xl " + classes.content}>
            {children}
          </Stack>
        </Stack>
      </Paper>
    </CustomMantineProvider>
  );
};

export default BlogContent;

export function BlogMenu({ headings, links, post }: {
  post: IPost,
  headings: MarkdownHeading[],
  links: ILink[]
}) {
  return (
    <CustomMantineProvider>
      <Stack gap="xl" style={{ position: 'sticky', top: 100 }}>
        <PostCard post={post} hideExcerpt />
        <Headings />
        <Tags />
      </Stack>
    </CustomMantineProvider>
  )

  function Headings() {
    return (
      <Card shadow="md" radius="lg" p="lg" visibleFrom="lg" >
        <Group mb="lg">
          <IconList size={20} />
          <Title order={4}>Headings</Title>
        </Group>
        <Stack gap="lg">
          {headings.map(heading => (
            <Anchor key={heading.slug} href={`#${heading.slug}`} style={{
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden"
            }} >
              {heading.text}
            </Anchor>)
          )}
        </Stack>
      </Card>
    )
  }

  function Tags() {
    return (
      <Card shadow="md" radius="lg" p="lg" visibleFrom="lg">
        <Title order={4} mb="lg">
          Tags
        </Title>
        <Group gap="xs">
          {links.map(({ label, href }) => (
            <Anchor key={label} href={href}>
              <Badge
                variant="light"
                style={{ cursor: "pointer" }}
                leftSection={<IconTag size={12} />}
              >
                {label}
              </Badge>
            </Anchor>
          ))}
        </Group>
      </Card>
    )
  }

}


export function RelatePosts({ id, category }: { id: string, category: string }) {
  const _relates = useStore($relates)
  const isLoading = useStore($isLoading)

  const relates = _relates.filter(p => p.id !== id)
  useEffect(() => {
    request(category)
  }, [])

  return (
    <CustomMantineProvider>
      <Paper shadow="md" className={classes.relates} radius="lg" p="lg" mt="xl" style={isLoading ? { opacity: 0 } : {}}>
        <Stack gap="md">
          <Carousel posts={relates} />
        </Stack>
      </Paper>
    </CustomMantineProvider>
  )
}