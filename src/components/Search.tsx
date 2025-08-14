import { Badge, Box, Button, Group, Loader, Modal, Paper, rem, Stack, Text, TextInput, Highlight, Center, Anchor, Flex, Kbd } from "@mantine/core";
import { useDebouncedCallback, useDisclosure, useHotkeys } from "@mantine/hooks"
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import { Calendar, Search as SearchIcon } from "lucide-react";
import { $postsToIndex, loadPostsToIndex } from "../stores/search";
import { useStore } from "@nanostores/react";
import dayjs from "dayjs";
import excerpt from "excerpt"
import type { SearchResult } from "minisearch";
import type { IPost } from "@/packages/utils/post";
import { Spotlight, spotlight } from "@mantine/spotlight"

export default function Search() {
  const [_searchOpened, { open: openSearch, close: _closeSearch }] = useDisclosure(false);
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
        {!isLoading && <Text span c="dimmed" size="xs" ml="1em"><Kbd>⌘</Kbd>+<Kbd>K</Kbd></Text>}
      </Button>
      {postsPromise && <Suspense>
        <SpotlightModal postsPromise={postsPromise} onSpotlightClose={closeSearch} />
      </Suspense>}
    </CustomMantineProvider>
  )
}

function SpotlightModal({ postsPromise, onSpotlightClose }: { postsPromise: Promise<void>, onSpotlightClose: () => void }) {
  use(postsPromise)
  spotlight.open()

  const [query, _setQuery] = useState("")
  const postsToIndex = useStore($postsToIndex)
  const [posts, setPosts] = useState<(SearchResult & IPost | IPost)[]>(postsToIndex.posts.reverse().slice(0, 6))

  const actions: ReactNode[] = posts.map(post => (
    <Spotlight.Action key={post.id} px={0} onClick={() => location.href = `/${post.category.label}/${post.id}`} closeSpotlightOnTrigger >
      <Group justify="space-between" align="flex-start" p={"xs"}>
        <Box>
          <Text fw={600} size="lg" mb={4}>
            <Highlight component="span" highlight={query} color="yellow">
              {post.title}
            </Highlight>
          </Text>
          {"queryTerms" in post && (post as SearchResult)?.queryTerms.map(q => (
            <Text c="dimmed" size="sm" mb="xs">
              <Highlight component="span" highlight={query} color="yellow">
                {excerpt(post.content, query, 100)}
              </Highlight>
            </Text>
          ))}

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
    </Spotlight.Action>))

  const handleSearch = useDebouncedCallback((query: string) => {
    if (query) {
      const _posts = (postsToIndex.index?.search(query) ?? []) as (SearchResult & IPost)[]
      setPosts(_posts)
    }
  }, 500)

  const setQuery = (query: string) => {
      _setQuery(query)
      handleSearch(query)
  }

  return (
    <Spotlight.Root query={query} onQueryChange={setQuery} maxHeight={"50vh"} scrollable onSpotlightClose={onSpotlightClose} style={(query ? { height: "auto" }: undefined)}>
      <Spotlight.Search placeholder="Search..." leftSection={<SearchIcon />} />
      <Spotlight.ActionsList>
        {actions.length > 0 ? actions : <Spotlight.Empty>Nothing found...</Spotlight.Empty>}
      </Spotlight.ActionsList>
      <Text size="xs" c="dimmed" ta="center" p={"md"}>
        Press <Kbd>Esc</Kbd> to close this dialog
      </Text>
    </Spotlight.Root>
  )
}