import { Masonry } from 'react-plock';
import CustomMantineProvider from '../../src/stores/CustomMantineProvider';
import { Button, Center, Loader, Stack } from '@mantine/core';
import { useStore } from '@nanostores/react';
import { $key, $loading, $posts, getKey, streamPosts, type IPostStreamParams } from './store/posts';
import { PostCard } from '@/packages/card/PostCard';
import { useCallback, useEffect } from 'react';

export interface IPlockProps extends IPostStreamParams {
    totalCount: number
}

export default function BlogPlock({ totalCount, ...param }: IPlockProps) {
    const key = getKey(param)
    const posts = useStore($posts)[key] ?? []
    const isLoading = useStore($loading)
    const hasMorePosts = posts.length < totalCount

    const columns = [1, 2, 3, 4, 5]

    useEffect(() => {
        $key.set(key)
        streamPosts(key)
    }, [])

    const loadMore = useCallback(async () => {
       await streamPosts(key)
    }, [param])

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
                            <Button variant="default"  onClick={loadMore}>
                                Load More
                            </Button>
                        )}
                </Center>
            )}
        </CustomMantineProvider>
    )
}