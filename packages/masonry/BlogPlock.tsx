import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Button, Center, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { $key, $loading, $posts, getKey, streamPosts, type IPostStreamParams } from "./store/posts";
import { SsrMasonry } from "./SsrMasonry";
import { PostCard, type IPost } from "@/packages/card/PostCard";
import { RevealCard } from "@/packages/card/RevealCard";
import {
  CardSkeleton,
  isSkeletonItem,
  skeletonItems,
  type ISkeletonItem,
} from "@/packages/card/CardSkeletons";
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
  // While a page streams in, placeholder cards occupy the next masonry slots.
  const items: (IPost | ISkeletonItem)[] =
    isLoading && hasMorePosts ? [
          ...posts,
          ...skeletonItems(
            posts.map((p) => ({ bgColor: p.data.bgColor, titleColor: p.data.titleColor })),
          ),
        ] : posts;

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
          items={items}
          render={(post) =>
            isSkeletonItem(post) ? (
              <CardSkeleton
                key={`sk-${post.skeleton}`}
                seed={post.skeleton + 1}
                bgColor={post.bgColor}
                titleColor={post.titleColor}
              />
            ) : (
              <RevealCard key={post.id} id={post.id}>
                {post.data.category === "podcast" ? (
                  <PodcastCardFromPost post={post} fill />
                ) : (
                  <PostCard post={post} fill />
                )}
              </RevealCard>
            )
          }
        />
      </Stack>
      {hasMorePosts && !isLoading && (
        <Center w={"100%"} pt={"xl"}>
          <Button variant="default" onClick={loadMore}>
            Load More
          </Button>
        </Center>
      )}
    </CustomMantineProvider>
  );
}
