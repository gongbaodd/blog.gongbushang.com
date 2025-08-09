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
} from "@tabler/icons-react";
import CustomMantineProvider from "../stores/CustomMantineProvider";

const BlogContent: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [readingProgress] = useState(65);

  const relatedArticles = [
    {
      id: 1,
      title: "React 18新特性详解",
      excerpt: "深入了解React 18带来的并发特性和新的API",
      image:
        "https://images.pexels.com/photos/11035380/pexels-photo-11035380.jpeg?auto=compress&cs=tinysrgb&w=300",
      readTime: "8 分钟",
      date: "2024年1月15日",
    },
    {
      id: 2,
      title: "TypeScript最佳实践",
      excerpt: "提高代码质量和开发效率的TypeScript技巧",
      image:
        "https://images.pexels.com/photos/270348/pexels-photo-270348.jpeg?auto=compress&cs=tinysrgb&w=300",
      readTime: "12 分钟",
      date: "2024年1月12日",
    },
    {
      id: 3,
      title: "Next.js性能优化指南",
      excerpt: "从零到一构建高性能的Next.js应用",
      image:
        "https://images.pexels.com/photos/546819/pexels-photo-546819.jpeg?auto=compress&cs=tinysrgb&w=300",
      readTime: "15 分钟",
      date: "2024年1月10日",
    },
  ];

  const comments = [
    {
      id: 1,
      author: "张三",
      avatar:
        "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100",
      content: "这篇文章写得非常好，对我的项目很有帮助！",
      date: "2 小时前",
      likes: 5,
    },
    {
      id: 2,
      author: "李四",
      avatar:
        "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=100",
      content: "代码示例很清晰，解释得很详细，感谢分享。",
      date: "1 天前",
      likes: 8,
    },
  ];

  return (
    <CustomMantineProvider>
        <Container fluid>
          <Grid gutter="xl">
            {/* 主要内容区域 */}
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper shadow="md" radius="lg" p="xl">
                {/* 文章头部 */}
                <Stack gap="lg">
                  <div>
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

                    <Title order={1} size="h1" mb="md" lh={1.2}>
                      构建现代化React应用：Mantine组件库深度指南
                    </Title>

                    <Text size="lg" c="dimmed" mb="xl">
                      探索Mantine这个强大的React组件库，学习如何快速构建美观且功能丰富的现代化Web应用程序
                    </Text>
                  </div>

                  {/* 作者信息和文章元数据 */}
                  <Group justify="space-between">
                    <Group>
                      <Avatar
                        src="/profile.jpg"
                        size="lg"
                        radius="xl"
                      />
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
                  {children}
                </Stack>
              </Paper>
            </Grid.Col>

            {/* 侧边栏 */}
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="xl">
                {/* 作者信息卡片 */}
                <Paper shadow="md" radius="lg" p="xl">
                  <Stack align="center" gap="md">
                    <Avatar
                      src="/profile.jpg"
                      size={120}
                      radius="xl"
                    />
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
                    {relatedArticles.map((article) => (
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
                    ))}
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
