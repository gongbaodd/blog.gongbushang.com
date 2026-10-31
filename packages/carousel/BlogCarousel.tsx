import { ActionIcon, Anchor, Box, Button, Card, Flex, Stack, Title } from "@mantine/core";
import { Carousel as MantineCarousel } from "@mantine/carousel";
import { IconX } from "@tabler/icons-react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./BlogCarousel.module.css";
import { PostCard, type IPost } from "../card/PostCard";
import { RevealCard } from "../card/RevealCard";
import { PodcastCardFromPost } from "@/packages/masonry/PodcastPlock";
import { useStore } from "@nanostores/react";
import { $latest, $totalCounts, requestLatestPosts } from "@/packages/carousel/latest";
import { useEffect } from "react";
import { $history, requestHistoryPosts } from "@/packages/carousel/history";

interface IBlogCarousel {
  title: string;
  posts: IPost[];
  link: { label: string; href: string };
}

export default function BlogCarousel({ title, posts, link: { label, href } }: IBlogCarousel) {
  return (
    <CustomMantineProvider>
      <Card shadow="md" radius="lg" p="xl">
        <Stack gap="md" style={{ height: "100%" }}>
          <Flex direction="row" justify={"space-between"} wrap={"wrap"}>
            <Stack justify="space-between" maw={"100%"}>
              <Title order={2} size="h2">
                {title}
              </Title>
              <Anchor href={href}>
                <Button size="md" variant="outline">
                  {label}
                </Button>
              </Anchor>
            </Stack>
            <Carousel posts={posts} className={classes.titled} />
          </Flex>
        </Stack>
      </Card>
    </CustomMantineProvider>
  );
}

export function LatestCarousel({
  totalCount = 0,
  initialPosts,
}: {
  totalCount?: number;
  initialPosts?: IPost[];
}) {
  // Seed before the first render so the client's first output equals the server HTML.
  if (initialPosts?.length && $latest.get().length === 0) $latest.set(initialPosts);
  const posts = useStore($latest);
  const totalCounts = useStore($totalCounts);

  useEffect(() => {
    if (!initialPosts?.length) requestLatestPosts();
  }, []);

  return (
    <BlogCarousel
      title="Latest Posts"
      posts={posts}
      link={{ label: `View All ${totalCounts || totalCount} Posts`, href: "/all" }}
    />
  );
}

export function HistoryCarousel({ initialPosts }: { initialPosts?: IPost[] }) {
  if (initialPosts?.length && $history.get().length === 0) $history.set(initialPosts);
  const posts = useStore($history);

  useEffect(() => {
    if (!initialPosts?.length) requestHistoryPosts();
  }, []);

  return (
    <BlogCarousel
      title="Time Machine"
      posts={posts}
      link={{ label: "View Archive", href: "/year" }}
    />
  );
}

export function Carousel({
  posts,
  className,
  height = 560,
  fill = false,
}: {
  posts: IPost[];
  className?: string;
  height?: number | string;
  fill?: boolean;
}) {
  return (
    <MantineCarousel
      slideSize="80%"
      height={fill ? "100%" : height}
      slideGap="lg"
      controlsOffset="lg"
      controlSize={40}
      withControls
      withIndicators
      emblaOptions={{ dragFree: true, align: "start" }}
      className={[classes.carousel, fill ? classes.carouselFill : undefined, className]
        .filter(Boolean)
        .join(" ")}
    >
      {posts.map((post) => (
        <MantineCarousel.Slide
          maw={300}
          key={post.id}
          display={"flex"}
          style={{ justifyContent: "center", alignItems: "center" }}
        >
          <RevealCard id={post.id} revealOnHydrate>
            {post.data.category === "podcast" ? (
              <PodcastCardFromPost post={post} hideExcerpt />
            ) : (
              <PostCard post={post} hideExcerpt />
            )}
          </RevealCard>
        </MantineCarousel.Slide>
      ))}
    </MantineCarousel>
  );
}

export function TooltipStackCarousel({
  posts,
  onClose,
  className,
  closeClassName,
}: {
  posts: IPost[];
  onClose: () => void;
  className?: string;
  closeClassName?: string;
}) {
  return (
    <Flex className={className} pos="relative" h="100%" w="100%" align="center" justify="center">
      <ActionIcon
        className={closeClassName}
        variant="subtle"
        color="gray"
        size="lg"
        radius="xl"
        aria-label="Close carousel"
        onClick={onClose}
      >
        <IconX size={18} />
      </ActionIcon>
      <Box w="100%" h="100%">
        <Carousel posts={posts} fill />
      </Box>
    </Flex>
  );
}
