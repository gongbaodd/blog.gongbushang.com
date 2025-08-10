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
  Card,
  Image,
  Stack,
  ActionIcon,
  Progress,
  Box,
  Anchor,
  List,
  Code,
  Blockquote,
  ScrollArea,
} from "@mantine/core";
import {
  IconHeart,
  IconShare,
  IconBookmark,
  IconEye,
  IconClock,
  IconUser,
  IconCalendar,
  IconTag,
  IconChevronRight,
  IconThumbUp,
  IconMessageCircle,
  IconList,
} from "@tabler/icons-react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import classes from "./BlogContent.module.css"

interface IProps {
   children: ReactNode;
   title: string;
}

const BlogContent: React.FC<IProps> = ({ children, title }) => {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  
  return (
    <CustomMantineProvider>
      <Container fluid>
        <Grid gutter="xl">
          <Grid.Col span={{ base: 12, md: 10 }}>
            <Paper shadow="md" radius="lg" p="xl">
              <Stack gap="lg">
                <Stack gap="lg">
                  <Group mb="sm">
                    <Badge color="blue" variant="light">
                      前端开发
                    </Badge>
                    <Badge color="green" variant="light">
                      React
                    </Badge>
                    <Badge color="orange" variant="light">
                      Mantine
                    </Badge>
                  </Group>

                  <Title
                    order={1}
                    size="h1"
                    mb="md"
                    lh={1.2}
                    className="prose lg:prose-xl"
                  >
                    {title}
                  </Title>
                </Stack>

                <Group justify="space-between">
                  <Group>
                    <Avatar src="/profile.jpg" size="lg" radius="xl" />
                    <div>
                      <Text fw={600}>J.Gong</Text>
                      <Group gap="xs">
                        <Group gap={4}>
                          <IconCalendar size={14} />
                          <Text size="sm" c="dimmed">
                            2024年1月20日
                          </Text>
                        </Group>
                        <Group gap={4}>
                          <IconClock size={14} />
                          <Text size="sm" c="dimmed">
                            10分钟阅读
                          </Text>
                        </Group>
                        <Group gap={4}>
                          <IconEye size={14} />
                          <Text size="sm" c="dimmed">
                            2.5k 次浏览
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
                <Stack className={"prose lg:prose-xl " + classes.content}>
                  {children}
                </Stack>
              </Stack>
            </Paper>
          </Grid.Col>

          {/* 侧边栏 */}
          <Grid.Col span={{ base: 12, md: 2 }}>
            <Stack gap="xl">
               <Paper shadow="md" radius="lg" p="xl" style={{ position: 'sticky', top: 100 }}>
                <Group mb="lg">
                  <IconList size={20} />
                  <Title order={4}>文章目录</Title>
                </Group>
                <ScrollArea h={300}>
                  <Stack gap="xs">
                    {/* {tableOfContents.map((item) => (
                      <Anchor
                        key={item.id}
                        onClick={() => scrollToSection(item.id)}
                        size="sm"
                        style={{
                          paddingLeft: item.level === 3 ? 16 : 0,
                          fontWeight: activeSection === item.id ? 600 : 400,
                          color: activeSection === item.id ? 'var(--mantine-color-blue-6)' : undefined,
                          cursor: 'pointer',
                          display: 'block',
                          padding: '4px 0',
                          borderLeft: activeSection === item.id ? '3px solid var(--mantine-color-blue-6)' : '3px solid transparent',
                          paddingLeft: item.level === 3 ? 19 : 3,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {item.title}
                      </Anchor>
                    ))} */}
                  </Stack>
                </ScrollArea>
              </Paper>
              <Paper shadow="md" radius="lg" p="xl">
                <Stack align="center" gap="md">
                  <Avatar src="/profile.jpg" size={120} radius="xl" />
                  <div style={{ textAlign: "center" }}>
                    <Title order={4}>J.Gong</Title>
                    <Text c="dimmed" size="sm" mb="md">
                      全栈开发工程师
                    </Text>
                    <Text size="sm" lh={1.4}>
                      专注于React、Node.js和现代Web开发技术。
                      热爱分享技术知识和最佳实践。
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

              {/* 标签云 */}
              <Paper shadow="md" radius="lg" p="xl">
                <Title order={4} mb="lg">
                  热门标签
                </Title>
                <Group gap="xs">
                  {[
                    "React",
                    "TypeScript",
                    "JavaScript",
                    "CSS",
                    "Node.js",
                    "Vue.js",
                    "Next.js",
                    "Webpack",
                  ].map((tag) => (
                    <Badge
                      key={tag}
                      variant="light"
                      style={{ cursor: "pointer" }}
                      leftSection={<IconTag size={12} />}
                    >
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </CustomMantineProvider>
  );
};

export default BlogContent;
