import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Button, Center, Loader, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { $key, $loading, $posts, getKey, streamPosts, type IPostStreamParams } from "./store/posts";
import { SsrMasonry } from "./SsrMasonry";
import { PostCard, type IPost } from "@/packages/card/PostCard";
import { PodcastCardFromPost } from "@/packages/masonry/PodcastPlock";
import { useCallback, useEffect } from "react";

export interface IPlockProps extends IPostStreamParams {
  totalCount: number;
  /** First posts rendered into the server HTML; the rest is streamed after mount. */
  initialPosts?: IPost[];
}

export default function BlogPlock({ totalCount, initialPosts, ...param }: IPlockProps) {
  const key = getKey(param);
  // Seed before the first render so the client's first output equals the server HTML.
  if (initialPosts?.length && !$posts.get()[key]) $posts.setKey(key, initialPosts);
  const posts = useStore($posts)[key] ?? [];
  const isLoading = useStore($loading);
  const hasMorePosts = posts.length < totalCount;

  useEffect(() => {
    $key.set(key);
    if (posts.length < totalCount) streamPosts(key);
  }, []);

  const loadMore = useCallback(async () => {
    await streamPosts(key);
  }, [param]);

  return (
    <CustomMantineProvider>
      <Stack mih={"100vh"}>
        <SsrMasonry
          items={posts}
          render={(post) =>
            post.data.category === "podcast" ? (
              <PodcastCardFromPost key={post.id} post={post} fill />
            ) : (
              <PostCard key={post.id} post={post} fill />
            )
          }
        />
      </Stack>
      {hasMorePosts && (
        <Center w={"100%"} pt={"xl"}>
          {isLoading ? (
            <Button variant="default" leftSection={<Loader size={"xs"} c={"dimmed"} />}>
              Loading
            </Button>
          ) : (
            <Button variant="default" onClick={loadMore}>
              Load More
            </Button>
          )}
        </Center>
      )}
    </CustomMantineProvider>
  );
}
