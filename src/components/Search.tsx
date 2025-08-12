import { Badge, Box, Button, Group, Loader, Modal, Paper, rem, Stack, Text, TextInput, Highlight, Center, Anchor } from "@mantine/core";
import { useDebouncedCallback, useDisclosure, useHotkeys } from "@mantine/hooks"
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Suspense, use, useState } from "react";
import { Calendar, Search as SearchIcon } from "lucide-react";
import { $postsToIndex, loadPostsToIndex } from "../stores/search";
import { useStore } from "@nanostores/react";
import dayjs from "dayjs";
import excerpt from "excerpt"
import type { SearchResult } from "minisearch";
import type { IPost } from "../pages/api/posts/all.json";

export default function Search() {
  const [searchOpened, { open: openSearch, close: _closeSearch }] = useDisclosure(false);
  const postsToIndex = useStore($postsToIndex)
  const isLoading = postsToIndex.isLoading
  const [postsPromise, setPostsPromise] = useState<null | Promise<void>>(null)
  const loadPosts = () => {
    openSearch()
    setPostsPromise(loadPostsToIndex())
  }

  const closeSearch = () => {
    _closeSearch()
    setPostsPromise(null)
  }

  useHotkeys([
    ['mod+K', loadPosts],
    ['/', loadPosts],
    ['Escape', closeSearch],
  ]);

  return (
    <CustomMantineProvider>
      <Button
        leftSection={isLoading ? <Loader size="xs" c={"dimmed"} /> : <SearchIcon size={16} />}
        radius={"xl"} variant="outline" c="dimmed"
        style={{ borderColor: "var(--mantine-color-dimmed)" }}
        onClick={loadPosts}
      >
        {isLoading ? "Loading..." : "Search..."}
        {!isLoading && <Text span c="dimmed" size="xs" ml="1em">⌘{" "}K</Text>}
      </Button>
      {postsPromise && <Suspense>
        <SearchModal searchOpened={searchOpened} closeSearch={closeSearch} postsPromise={postsPromise} />
      </Suspense>}
    </CustomMantineProvider>
  )
}


function SearchModal({ searchOpened, closeSearch, postsPromise }: { searchOpened: boolean, closeSearch: () => void, postsPromise: Promise<void> }) {
  use(postsPromise)
  const postsToIndex = useStore($postsToIndex)
  const [posts, setPosts] = useState<(SearchResult & IPost)[]>([])
  const [query, setQuery] = useState("")
  const handleSearch = useDebouncedCallback((query: string) => {
    if (query) {
       const _posts = (postsToIndex.index?.search(query) ?? []) as (SearchResult & IPost)[]
       setPosts(_posts)
    }
  }, 500)

  return (
      <Modal
        opened={searchOpened} onClose={closeSearch}
        size={"lg"}
        centered
        overlayProps={{
          backgroundOpacity: .6,
          blur: 4
        }}
        withCloseButton={false}
      >
        <Stack gap="md">
          <TextInput
            placeholder="Search Contents..."
            size="lg"
            leftSection={<SearchIcon size={20} />}
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value
              setQuery(value)
              handleSearch(value)
            }}
            autoFocus
          />

          <Box style={{ maxHeight: '50vh', overflowY: 'auto', overflowX: "hidden" }}>
            <Stack gap="xs">
              {query.length > 0 && posts.length === 0 ? (
                <Center>
                  <Text c="dimmed">Sorry, no related files.</Text>
                </Center>
              ) : (
                posts.map((post) => (
                  <Anchor href={`/${post.category.label}/${post.id}`}>
                    <Paper key={post.id} p="md" withBorder style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}>
                      <Group justify="space-between" align="flex-start">
                        <Box>
                          <Text fw={600} size="lg" mb={4}>
                            <Highlight component="span" highlight={post.queryTerms} color="yellow">
                              {post.title}
                            </Highlight>
                          </Text>
                          <Text c="dimmed" size="sm" mb="xs">
                            <Highlight component="span" highlight={post.queryTerms} color="yellow">
                              {excerpt(post.content, post.queryTerms[0], 100)}
                            </Highlight>
                          </Text>
                          <Group gap="xs" mb="xs">
                            {[post.category, post.series!, ...post.tags].filter(Boolean).map(({ label }) => (
                              <Badge key={label} variant="light" size="xs">
                                {label}
                              </Badge>
                            ))}
                          </Group>
                          <Group gap={4}>
                            <Calendar size={14} />
                            <Text size="xs" c="dimmed">
                              {dayjs(post.date).format("YYYY-MM-DD")}
                            </Text>
                          </Group>
                        </Box>
                      </Group>
                    </Paper>
                  </Anchor>
                ))
              )}
            </Stack>
          </Box>

          <Text size="xs" c="dimmed" ta="center">
            Press ESC to close this dialog
          </Text>
        </Stack>
      </Modal>
  )
}