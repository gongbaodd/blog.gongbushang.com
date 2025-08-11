import { Badge, Box, Button, Group, Loader, Modal, Paper, rem, Stack, Text, TextInput, Highlight } from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks"
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Calendar, User, Search as SearchIcon } from "lucide-react";

const mockArticles = [
  {
    id: 1,
    title: 'React 18 新特性全解析',
    excerpt: '深入了解 React 18 带来的并发渲染、自动批处理等重要特性...',
    content: 'React 18 引入了许多令人兴奋的新特性，包括并发渲染、自动批处理、悬浮组件等。这些特性将显著提升应用程序的性能和用户体验。',
    author: '张三',
    date: '2024-01-15',
    tags: ['React', 'JavaScript', '前端开发'],
  },
  {
    id: 2,
    title: 'TypeScript 最佳实践指南',
    excerpt: '学习如何在项目中更好地使用 TypeScript，提高代码质量...',
    content: 'TypeScript 为 JavaScript 开发带来了静态类型检查的优势。本文将介绍一些实用的 TypeScript 最佳实践，帮助您编写更安全、更可维护的代码。',
    author: '李四',
    date: '2024-01-10',
    tags: ['TypeScript', 'JavaScript', '最佳实践'],
  },
  {
    id: 3,
    title: 'Mantine UI 组件库入门教程',
    excerpt: '从零开始学习 Mantine，构建现代化的 React 应用界面...',
    content: 'Mantine 是一个功能强大的 React 组件库，提供了丰富的组件和主题系统。本教程将帮助您快速上手 Mantine，构建美观的用户界面。',
    author: '王五',
    date: '2024-01-05',
    tags: ['Mantine', 'React', 'UI组件'],
  },
  {
    id: 4,
    title: 'CSS Grid 布局完全指南',
    excerpt: '掌握 CSS Grid 的强大布局能力，创建复杂的网页布局...',
    content: 'CSS Grid 是现代网页布局的强大工具。本文将详细介绍 Grid 布局的各种属性和用法，帮助您创建灵活、响应式的网页布局。',
    author: '赵六',
    date: '2023-12-28',
    tags: ['CSS', 'Grid', '布局'],
  },
  {
    id: 5,
    title: 'Node.js 性能优化技巧',
    excerpt: '提升 Node.js 应用性能的实用技巧和最佳实践...',
    content: 'Node.js 应用的性能优化是每个后端开发者都应该关注的话题。本文将分享一些实用的优化技巧，包括内存管理、异步处理等方面。',
    author: '陈七',
    date: '2023-12-20',
    tags: ['Node.js', '性能优化', '后端开发'],
  },
];


function SearchModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(mockArticles);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (opened && !hasLoadedOnce) {
      setLoading(true);
      // 模拟首次加载文章
      setTimeout(() => {
        setLoading(false);
        setHasLoadedOnce(true);
      }, 1500);
    }
  }, [opened, hasLoadedOnce]);

  useEffect(() => {
    if (hasLoadedOnce) {
      if (searchQuery.trim() === '') {
        setSearchResults(mockArticles);
      } else {
        const filtered = mockArticles.filter(
          (article) =>
            article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
        );
        setSearchResults(filtered);
      }
    }
  }, [searchQuery, hasLoadedOnce]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      centered
      overlayProps={{
        backgroundOpacity: 0.6,
        blur: 4,
      }}
      styles={{
        // modal: {
        //   maxHeight: '80vh',
        //   overflow: 'hidden',
        // },
      }}
      withCloseButton={false}
    >
      <Stack gap="md">
        <TextInput
          placeholder="搜索文章标题、内容或标签..."
          size="lg"
          leftSection={<SearchIcon size={20} />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          styles={{
            input: {
              border: 'none',
              borderBottom: '2px solid #e9ecef',
              borderRadius: 0,
              fontSize: rem(18),
              padding: `${rem(12)} ${rem(16)}`,
            },
          }}
          autoFocus
        />

        <Box style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {loading ? (
            <Box style={{ textAlign: 'center', padding: rem(40) }}>
              <Loader size="md" />
              <Text mt="md" c="dimmed">
                正在加载文章...
              </Text>
            </Box>
          ) : (
            <Stack gap="xs">
              {searchResults.length === 0 ? (
                <Box style={{ textAlign: 'center', padding: rem(40) }}>
                  <Text c="dimmed">没有找到相关文章</Text>
                </Box>
              ) : (
                searchResults.map((article) => (
                  <Paper
                    key={article.id}
                    p="md"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    // sx={(theme) => ({
                    //   '&:hover': {
                    //     backgroundColor: theme.colors.gray[0],
                    //     transform: 'translateY(-1px)',
                    //     boxShadow: theme.shadows.sm,
                    //   },
                    // })}
                  >
                    <Group justify="space-between" align="flex-start">
                      <Box style={{ flex: 1 }}>
                        <Text fw={600} size="lg" mb={4}>
                          <Highlight highlight={searchQuery} color="yellow">
                            {article.title}
                          </Highlight>
                        </Text>
                        <Text c="dimmed" size="sm" mb="xs">
                          <Highlight highlight={searchQuery} color="yellow">
                            {article.excerpt}
                          </Highlight>
                        </Text>
                        <Group gap="xs" mb="xs">
                          {article.tags.map((tag) => (
                            <Badge key={tag} variant="light" size="xs">
                              <Highlight highlight={searchQuery} color="yellow">
                                {tag}
                              </Highlight>
                            </Badge>
                          ))}
                        </Group>
                        <Group gap="md">
                          <Group gap={4}>
                            <User size={14} />
                            <Text size="xs" c="dimmed">
                              {article.author}
                            </Text>
                          </Group>
                          <Group gap={4}>
                            <Calendar size={14} />
                            <Text size="xs" c="dimmed">
                              {article.date}
                            </Text>
                          </Group>
                        </Group>
                      </Box>
                    </Group>
                  </Paper>
                ))
              )}
            </Stack>
          )}
        </Box>

        <Text size="xs" c="dimmed" ta="center">
          按 ESC 键关闭搜索
        </Text>
      </Stack>
    </Modal>
  );
}
export default function Search() {
    const [searchOpened, { open: openSearch, close: closeSearch }] = useDisclosure(false);
    const [isLoading, setIsLoading] = useState(false)

    useHotkeys([
        ['mod+K', openSearch],
        ['/', openSearch],
        ['Escape', closeSearch],
    ]);

    const loadPostsIndex = useCallback(async () => {
          setIsLoading(true)

    }, [])

    return (
        <CustomMantineProvider>
            <Button
                leftSection={isLoading ? <Loader size="xs" c={"dimmed"} /> : <IconSearch size={16} />}
                radius={"xl"} variant="outline" c="dimmed"
                style={{ borderColor: "var(--mantine-color-dimmed)" }}
                onClick={loadPostsIndex}
            >
                {isLoading? "Loading..." : "Search..."}
                {!isLoading && <Text span c="dimmed" size="xs" ml="1em">⌘{" "}K</Text>}
            </Button>
            <SearchModal opened={searchOpened} onClose={closeSearch} />
        </CustomMantineProvider>
    )
}