import {
  AppShell,
  Container,
  Flex,
  Grid,
  Group,
  MantineProvider,
  Paper,
  Stack,
  TextInput,
  Title,
  Text,
  Button,
  Badge,
  Card,
  Box,
  Avatar,
  Anchor,
  Divider,
  ActionIcon,
} from "@mantine/core";
import {
  IconBookmark,
  IconCalendar,
  IconFolder,
  IconHeart,
  IconMessageCircle,
  IconSearch,
  IconShare,
  IconTag,
} from "@tabler/icons-react";
import { Masonry } from "@mui/lab";
import classes from "./BlogList.module.css";

interface Props {
  posts: IPost[];
}

export interface IPost {
  id: string;
  title: string;
  date: Date;
  data: {
    category: string;
    tag?: string[];
    [T: string]: any;
  };
  excerpt: string;
}

export default function BlogList(props: Props) {
  return (
    <MantineProvider>
      <List posts={props.posts}></List>
    </MantineProvider>
  );
}

const categories = [
  "全部",
  "前端开发",
  "CSS设计",
  "TypeScript",
  "UI/UX设计",
  "后端开发",
];
const allTags = [
  "React",
  "JavaScript",
  "前端",
  "CSS",
  "布局",
  "Grid",
  "TypeScript",
  "类型系统",
  "编程",
  "响应式",
  "设计",
  "用户体验",
  "Node.js",
  "性能优化",
  "后端",
];

function List({ posts }: Props) {
  return (
    <Container size="xl">
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="lg">
            {/* Categories */}
            <Paper p="md" radius="md" withBorder>
              <Group mb="md">
                <IconFolder size={20} color="var(--mantine-color-blue-6)" />
                <Text fw={600} size="lg">
                  分类
                </Text>
              </Group>
              <Stack gap="xs">
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant={"default"}
                    color="blue"
                    justify="flex-start"
                    fullWidth
                    size="sm"
                  >
                    {category}
                  </Button>
                ))}
              </Stack>
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Group mb="md">
                <IconTag size={20} color="var(--mantine-color-green-6)" />
                <Text fw={600} size="lg">
                  标签
                </Text>
              </Group>
              <Group gap="xs">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={"outline"}
                    color="green"
                    style={{ cursor: "pointer" }}
                    size="sm"
                  >
                    {tag}
                  </Badge>
                ))}
              </Group>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </Stack>
        </Grid.Col> */}
      </Grid>

      <Container size="xl" className="py-8">
        <Masonry columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }} spacing={3}>
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post}/>
          ))}
        </Masonry>
      </Container>
    </Container>
  );
}

function PostCard({ post }: { post: IPost }) {
  return (
    <Card key={post.id} shadow="sm" padding="lg" radius="md" withBorder className={classes.item} >
      <Flex gap="md" align="center" justify="center">
        {/* Avatar/Thumbnail */}
        <Box>
          <Avatar size={128} radius="md">
            {post.title.charAt(0)}
          </Avatar>
        </Box>
      </Flex>

      <Box style={{ flex: 1, minWidth: 0 }}>
        <Stack gap="sm">
          <Box>
            <Anchor
              component="button"
              fw={700}
              size="lg"
              c={"light"}
              style={{
                textAlign: "left",
                textDecoration: "none",
              }}
              onClick={() => {}}
            >
              {post.title}
            </Anchor>
            <Group gap="md" mt="xs">
              <Group gap="xs">
                <IconCalendar size={14} color="var(--mantine-color-gray-6)" />
                <Text size="sm" c="dimmed">
                  {post.date.toISOString()}
                </Text>
              </Group>
              <Badge color="blue" variant="light" size="sm">
                {post.data.category}
              </Badge>
            </Group>
          </Box>

          <Text c="dimmed" size="sm" lineClamp={3}>
            {post.excerpt}
          </Text>

          <Group gap="xs">
            {post.data.tag?.map((tag) => (
              <Badge key={tag} color="gray" variant="outline" size="xs">
                #{tag}
              </Badge>
            ))}
          </Group>

          <Divider />

          {/* Actions */}
          <Group justify="space-between">
            <Group gap="lg">
              <Group gap="xs">
                <ActionIcon variant="subtle" color={"red"} size="sm">
                  <IconHeart size={16} fill={"currentColor"} />
                </ActionIcon>
                <Text size="sm" c="dimmed">
                  1
                </Text>
              </Group>

              <Group gap="xs">
                <ActionIcon variant="subtle" color="gray" size="sm">
                  <IconMessageCircle size={16} />
                </ActionIcon>
                <Text size="sm" c="dimmed">
                  comments
                </Text>
              </Group>

              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconShare size={16} />
              </ActionIcon>
            </Group>

            <ActionIcon variant="subtle" color={"yellow"} size="sm">
              <IconBookmark size={16} fill={"currentcolor"} />
            </ActionIcon>
          </Group>
        </Stack>
      </Box>
    </Card>
  );
}
