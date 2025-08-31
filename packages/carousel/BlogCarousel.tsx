import { Anchor, Button, Card, Flex, Stack, Title } from "@mantine/core";
import { Carousel as MantineCarousel } from "@mantine/carousel";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./BlogCarousel.module.css"
import { PostCard, type IPost } from "../card/PostCard";
import { useStore } from "@nanostores/react";
import { $latest, $totalCounts, requestLatestPosts } from "@/packages/carousel/latest";
import { useEffect } from "react";
import { $history, requestHistoryPosts } from "@/packages/carousel/history";

interface IBlogCarousel {
    title: string
    posts: IPost[]
    link: { label: string, href: string }
}

export default function BlogCarousel({ title, posts, link: { label, href } }: IBlogCarousel) {
    return (
        <CustomMantineProvider>
            <Card shadow="md" radius="lg" p="xl"  >
                <Stack gap="md" style={{ height: "100%" }}>
                    <Flex direction="row" justify={"space-between"} wrap={"wrap"}>
                        <Stack justify="space-between" maw={"100%"}>
                            <Title order={2} size="h2">{title}</Title>
                            <Anchor href={href}>
                                <Button size="md" variant="outline">{label}</Button>
                            </Anchor>
                        </Stack>
                        <Carousel posts={posts} className={classes.titled} />
                    </Flex>
                </Stack>
            </Card>
        </CustomMantineProvider>
    )
}

export function LatestCarousel() {
    const posts = useStore($latest)
    const totalCounts = useStore($totalCounts)

    useEffect(() => {
        requestLatestPosts()
    }, [])

    return <BlogCarousel 
        title="Latest Posts" 
        posts={posts} 
        link={{ label: `View All ${totalCounts} Posts`, href: "/all" }} 
    />
}

export function HistoryCarousel() {
    const posts = useStore($history)

    useEffect(() => {
        requestHistoryPosts()
    }, [])

    return <BlogCarousel 
        title="Time Machine" 
        posts={posts} 
        link={{label: "View Archivess", href: "/year"}} 
    />
}

export function Carousel({ posts, className }: { posts: IPost[]; className?: string }) {
    return (
        <MantineCarousel
            slideSize="80%"
            height={560}
            slideGap="lg"
            controlsOffset="lg"
            controlSize={40}
            withControls
            withIndicators
            emblaOptions={{ dragFree: true, align: 'start' }}
            className={[classes.carousel, className].filter(Boolean).join(" ")}
        >
            {posts.map((post) => (
                <MantineCarousel.Slide maw={300} key={post.id} display={"flex"} style={{ justifyContent: "center", alignItems: "center" }}>
                    <PostCard key={post.id} post={post} hideExcerpt />
                </MantineCarousel.Slide>
            ))}
        </MantineCarousel>
    )
}