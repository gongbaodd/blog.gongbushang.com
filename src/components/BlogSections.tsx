import { Container, Grid, Stack, Title, SimpleGrid } from "@mantine/core";
import { PostCard, type IPost } from "./BlogList";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface Props {
  latestPosts: IPost[];
  historyPosts: IPost[];
}

export default function BlogSections({ latestPosts, historyPosts }: Props) {
  return (
    <CustomMantineProvider>
      <Container size="xl" py="xl">
        <Grid gutter="xl">
          {/* Latest Posts Section */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="lg">
              <Title order={2} size="h2" fw={600}>
                Latest Posts
              </Title>
              <Stack gap="md">
                {latestPosts.map((post, index) => (
                  <PostCard key={post.id} post={post} index={index} />
                ))}
              </Stack>
            </Stack>
          </Grid.Col>

          {/* History Posts Section */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="lg">
              <Title order={2} size="h2" fw={600}>
                From the Archives
              </Title>
              <Stack gap="md">
                {historyPosts.map((post, index) => (
                  <PostCard key={post.id} post={post} index={index + 3} />
                ))}
              </Stack>
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </CustomMantineProvider>
  );
}