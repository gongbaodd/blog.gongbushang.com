import { Masonry } from 'react-plock';
import CustomMantineProvider from '../../src/stores/CustomMantineProvider';
import { Button, Center, Loader, Stack } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { $hasMorePosts, $loading, $posts, streamPosts } from '../../src/stores/posts';
import { PostCard } from '@/packages/card/PostCard';

export default function BlogPlock() {
    const posts = useStore($posts)
    const isLoading = useStore($loading)
    const hasMorePosts = useStore($hasMorePosts)
    const columns = [1, 2, 3, 4, 5]

    return (
        <CustomMantineProvider>
            <Stack mih={"100vh"}>
                <Masonry
                    items={posts}
                    config={{
                        columns,
                        gap: [48, 16, 32, 32, 32],
                        media: [28, 48, 75, 88, 110].map(i => i * 16),
                    }}
                    render={post => (
                        <PostCard key={post.id} post={post} />
                    )}
                />
            </Stack>
            {hasMorePosts && (
                <Center w={"100%"} pt={"xl"}>
                    {isLoading ?
                        (
                            <Button variant='default' leftSection={<Loader size={"xs"} c={"dimmed"} />}>
                                Loading
                            </Button>
                        ) :
                        (
                            <Button variant="default" onClick={() => streamPosts()}>
                                Load More
                            </Button>
                        )}
                </Center>
            )}
        </CustomMantineProvider>
    )
}