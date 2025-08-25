import React, { useState, type ReactNode } from "react";
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Avatar,
  Badge,
  Divider,
  Button,
  Grid,
  Stack,
  ActionIcon,
  Anchor,
  Image,
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
import CustomMantineProvider from "../stores/CustomMantineProvider";
import classes from "./BlogContent.module.css"
import dayjs from "dayjs"
import type { MarkdownHeading } from "astro";
import { isString } from "es-toolkit";

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
  headings: MarkdownHeading[];
  cover?: {
    url: {
      src: string;
    };
    alt: string;
  }
}

const BlogContent: React.FC<IProps> = ({ children, title, links, date, time, headings, cover }) => {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const coverUrl = isString(cover?.url) ? cover.url : cover?.url.src;

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
            <Group className="prose lg:prose-xl">
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

            <Group>
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
            </Group>
          </Group>

          <Divider />
          {coverUrl && <Image src={coverUrl} alt={cover?.alt} radius={"lg"} />}
          <Stack className={"prose lg:prose-xl " + classes.content}>
            {children}
          </Stack>
        </Stack>
      </Paper>
    </CustomMantineProvider>
  );
};

export default BlogContent;

export function BlogMenu({ headings, links }: {
  headings: MarkdownHeading[],
  links: ILink[]
}) {
  return (
    <CustomMantineProvider>
      <Stack gap="xl" style={{ position: 'sticky', top: 100 }}>
        <Paper shadow="md" radius="lg" p="xl" >
          <Group mb="lg">
            <IconList size={20} />
            <Title order={4}>Headings</Title>
          </Group>
          <Stack gap="xs">
            {headings.map(heading => (<Anchor key={heading.slug} href={`#${heading.slug}`} >
              {heading.text}
            </Anchor>))}
          </Stack>
        </Paper>
        <Paper shadow="md" radius="lg" p="xl">
          <Stack align="center" gap="md">
            <Avatar src="/profile.jpg" size={120} radius="xl" />
            <div style={{ textAlign: "center" }}>
              <Title order={4}>J.Gong</Title>
              <Text size="sm" lh={1.4}>
              </Text>
            </div>
            <Button fullWidth variant="light">
              关注作者
            </Button>
          </Stack>
        </Paper>

        {/* 相关文章 */}
        <Paper shadow="md" radius="lg" p="xl">
          <Title order={4} mb="lg">
            相关文章
          </Title>
          <Stack gap="md">
            {/* {relatedArticles.map((article) => (
                      <Card
                        key={article.id}
                        padding="md"
                        radius="md"
                        withBorder
                      >
                        <Card.Section>
                          <Image
                            src={article.image}
                            height={120}
                            alt={article.title}
                          />
                        </Card.Section>

                        <Stack gap="xs" mt="md">
                          <Title order={6} lh={1.3}>
                            {article.title}
                          </Title>
                          <Text size="sm" c="dimmed" lh={1.4}>
                            {article.excerpt}
                          </Text>
                          <Group justify="space-between" mt="sm">
                            <Group gap="xs">
                              <IconClock size={14} />
                              <Text size="xs" c="dimmed">
                                {article.readTime}
                              </Text>
                            </Group>
                            <Anchor size="sm">
                              <Group gap={4}>
                                阅读
                                <IconChevronRight size={14} />
                              </Group>
                            </Anchor>
                          </Group>
                        </Stack>
                      </Card>
                    ))} */}
          </Stack>
        </Paper>

        <Paper shadow="md" radius="lg" p="xl">
          <Title order={4} mb="lg">
            Tags
          </Title>
          <Group gap="xs">
            {links.map(({ label, href }) => (
              <Badge
                key={label}
                variant="light"
                style={{ cursor: "pointer" }}
                leftSection={<IconTag size={12} />}
              >
                {label}
              </Badge>
            ))}
          </Group>
        </Paper>
      </Stack>
    </CustomMantineProvider>
  )
}