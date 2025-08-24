import { Button, Center, Flex, Stack } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { useEffect, useRef } from "react";
import Masonry from "masonry-layout"
import { useStore } from "@nanostores/react";
import { $hasMorePosts, $posts, streamPosts } from "../stores/posts";
import { PostCard } from "@/packages/card/PostCard";

export default function BlogMasonry() {
    const ref = useRef(null)
    const posts = useStore($posts)

    useEffect(() => {
        const div = ref.current
        if (!div) return
        new Masonry(div, {
            itemSelector: '.grid-item',
            columnWidth: 50,

        });

    }, [posts])

    return (
        <CustomMantineProvider>
            <Stack>
                <div ref={ref}>
                    {posts.map((post, i) => (
                        <PostCard key={post.id} post={post} />
                    ))}
                </div>
            </Stack>
            {$hasMorePosts.get() && (
                <Center w={"100%"}>
                    <Button variant="default" onClick={() => streamPosts()}>
                        Load More
                    </Button>
                </Center>
            )}
        </CustomMantineProvider>
    )
}