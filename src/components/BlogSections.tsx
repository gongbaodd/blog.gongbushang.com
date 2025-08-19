import { Container, Grid, Stack, Title, Paper, Button, Group, Flex, Anchor, Card } from "@mantine/core";
import { PostCard, type IPost } from "./BlogList";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Carousel } from '@mantine/carousel';
import type { ReactNode } from "react";

interface Props {
  latestPosts: IPost[];
  historyPosts: IPost[];
  totalCount: number;
}

export default function BlogSections({ latestPosts, historyPosts, totalCount }: Props) {
  return (
    <CustomMantineProvider>
      <Container fluid p={0} style={{ marginInline: "initial" }}>
        <Grid gutter="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <BlogSection title="Latest Posts" posts={latestPosts} >
              <Anchor href="/all">
                <Button size="md" variant="outline">View All {totalCount} Posts</Button>
              </Anchor>
            </BlogSection>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <BlogSection title="Time machine" posts={historyPosts} >
              <Anchor href="/archive">
                <Button size="md" variant="outline">View Archives</Button>
              </Anchor>
            </BlogSection>
          </Grid.Col>
        </Grid>
      </Container>
    </CustomMantineProvider>
  );
}

function BlogSection({ title, posts, children }: { title: string, posts: IPost[], children: ReactNode }) {
  return (
    <Card shadow="md" radius="lg" p="xl"  >
      <Stack gap="md" justify="space-between" style={{ height: "100%" }}>
        <Flex direction="row" justify={"space-between"}>
          <Stack justify="space-between">
            <Title order={2} size="h2" fw={600}>
              {title}
            </Title>
            {children}
          </Stack>
          <Carousel
            maw={600}
            slideSize="70%"
            height={450}
            slideGap="sm"
            controlsOffset="lg"
            controlSize={40}
            withControls
            withIndicators={false}
            emblaOptions={{ dragFree: true, align: 'start' }}
            style={{
              borderRadius: "var(--mantine-radius-md)"
            }}
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
  )
}