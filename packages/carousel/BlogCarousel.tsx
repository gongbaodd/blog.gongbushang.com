import { Anchor, Button, Card, Flex, Stack, Title } from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { PostCard, type IPost } from "@/src/components/BlogList";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./BlogCarousel.module.css"

export default function BlogCarousel({ title, posts, link: { label, href } }: { title: string, posts: IPost[], link: { label: string, href: string } }) {
    return (
        <CustomMantineProvider>
            <Card shadow="md" radius="lg" p="xl"  >
                <Stack gap="md" justify="space-between" style={{ height: "100%" }}>
                    <Flex direction="row" justify={"space-between"} wrap={"wrap"}>
                        <Stack justify="space-between" maw={"100%"}>
                            <Title order={2} size="h2">{title}</Title>
                            <Anchor href={href}>
                                <Button size="md" variant="outline">{label}</Button>
                            </Anchor>
                        </Stack>
                        <Carousel
                            slideSize="70%"
                            height={480}
                            slideGap="sm"
                            controlsOffset="lg"
                            controlSize={40}
                            withControls
                            withIndicators
                            emblaOptions={{ dragFree: true, align: 'start' }}
                            className={classes.carousel}
                        >
                            {posts.map((post) => (
                                <Carousel.Slide maw={250} key={post.id} display={"flex"} style={{ justifyContent: "center", alignItems: "center" }}>
                                    <PostCard key={post.id} post={post} hideExcerpt />
                                </Carousel.Slide>
                            ))}
                        </Carousel>
                    </Flex>
                </Stack>
            </Card>
        </CustomMantineProvider>
    )
}