import { Badge, Box, Button, Group, Loader, Paper, Text,  Highlight, Center, Kbd, Container } from "@mantine/core";
import { useDebouncedCallback, useDisclosure, useHotkeys } from "@mantine/hooks"
import { useCallback, useState, type ReactNode } from "react";
import { Calendar, Search as SearchIcon } from "lucide-react";
import { useStore } from "@nanostores/react";
import dayjs from "dayjs";
import excerpt from "excerpt"
import type { SearchResult } from "minisearch";
import { Spotlight, spotlight } from "@mantine/spotlight"
import LetterGlitch from "@/src/bits/Backgrounds/LetterGlitch/LetterGlitch";
import { $index, $posts, loadPostsToIndex, search } from "@/src/stores/search";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";

export default function Search() {
  const [_searchOpened, { open: openSearch, close: closeSearch }] = useDisclosure(false);
  const postsToIndex = useStore($index)
  const isLoading = postsToIndex.isLoading
  const loadPosts = useCallback(async () => {
    openSearch()
    await loadPostsToIndex()
    spotlight.open()
  }, [])

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
        visibleFrom="sm"
      >
        {isLoading ? "Loading..." : "Search..."}
        {!isLoading && <Text span c="dimmed" size="xs" ml="1em"><Kbd>⌘</Kbd>+<Kbd>K</Kbd></Text>}
      </Button>
      <Button 
        hiddenFrom="sm" 
        onClick={loadPosts}
        c="dimmed"
        radius={"xl"}
        variant="outline"
        style={{ borderColor: "var(--mantine-color-dimmed)" }}
      >
        {isLoading ? <Loader size="xs" c={"dimmed"} /> : <SearchIcon size={16} />}
      </Button>
      <SpotlightModal onSpotlightClose={closeSearch} />
    </CustomMantineProvider>
  )
}

function SpotlightModal({ onSpotlightClose }: { onSpotlightClose: () => void }) {

  const [query, _setQuery] = useState("")
  const posts = useStore($posts)

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
    search(query)
  }, 200)

  const setQuery = (query: string) => {
    _setQuery(query)
    handleSearch(query)
  }

  return (
    <Spotlight.Root query={query} onQueryChange={setQuery} maxHeight={"50vh"} scrollable onSpotlightClose={onSpotlightClose} style={(query ? { height: "auto" } : undefined)}>
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

export function SearchBanner() {
  const postsToIndex = useStore($index)
  const isLoading = postsToIndex.isLoading
  const loadPosts = useCallback(async () => {
    await loadPostsToIndex()
    spotlight.open()
  }, [])
  return (
    <CustomMantineProvider>
      <Container fluid style={{ marginInline: "initial" }} p={0}>
        <Paper h={300} shadow="md" radius="lg" p={0} style={{ overflow: "hidden", position: "relative" }} >
          <LetterGlitch
            glitchColors={['#2b4539', '#61dca3', '#61b3dc']}
            glitchSpeed={50}
            centerVignette={true}
            outerVignette={true}
            smooth={true}
          >
          </LetterGlitch>
          <Center w={"100%"} h={"100%"} top={0} left={0} style={{ position: "absolute" }}>
            <Button
              leftSection={isLoading ? <Loader size="xs" c={"dimmed"} /> : <SearchIcon size={16} />}
              radius={"xl"} variant="outline" c="dimmed"
              style={{
                borderColor: "var(--mantine-color-dimmed)",
                backgroundColor: "var(--mantine-color-gray-4)"
              }}
              onClick={loadPosts}
              w={400}
            >
              {isLoading ? "Loading..." : "Search..."}
            </Button>
          </Center>
        </Paper>
      </Container>
    </CustomMantineProvider>
  )
}