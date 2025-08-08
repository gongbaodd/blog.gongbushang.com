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
import CustomMantineProvider from "../stores/CustomMantineProvider";
import wordcount from "words-count";

enum CARD_RATIO {
  xs = "xs",
  sm = "sm",
  md = "md",
  lg = "lg",
  xl = "xl",
}

const CARD_CLASSNAMES = [
  "liquid_cheese",
  "protruding_squares",
  "wintery_sunburst",
  "subtle_prism",
  "bullseye_gradient",
  "spectrum_gradient",
  "wavy_fingerprint",
  "radient_gradient",
  "endless_constellation",
  "zig_zag",
  "repeating_chevrons",
  "large_triangles",
  "abstract_envelope",
  "diamond_sunset",
  "square_versatiles",
  "geometric_intersaction",
  "diagonal_stripes",
  "hollowed_boxes",
  "rose_petals",
  "confetti_doodles",
  "dragon_scales",
  "quantum_gradient",
  "cornered_staires",
  "slanted_gradient",
  "dalmatian_spots",
  "tortoise_shell",
  "alternating_arrowhead",
  "repeating_triangles",
  "bermuda_triangle",
  "bermuda_square",
  "bermuda_diamond",
  "parabolic_rectangle",
  "parabolic_pentagon",
  "parabolic_ellipse",
  "parabolic_triangle",
  "polka_dots",
  "colorful_stingrays",
  "varying_stripes",
  "vanishing_stripes",
  "sun_tornado",
  "scattered_forcefields",
  "page_turner",
  "abstract_timekeeper",
  "rainbow_vortex",
  "subtle_stripes",
  "pattern_randomized",
  "flat_mountains",
  "bermuda_circle",
];

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
    <CustomMantineProvider>
      <List posts={props.posts}></List>
    </CustomMantineProvider>
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
    <Container fluid>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 2 }}>
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
        <Grid.Col span={{ base: 12, md: 10 }}>
          <Masonry
            columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
            spacing={3}
            sequential
          >
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} index={i} />
            ))}
          </Masonry>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

function PostCard({ post, index }: { post: IPost; index: number }) {
  const title = post.title;

  const { layoutCls } = {
    get layoutCls() {
      let count = wordcount(title) + (post.data.tag?.length ?? 0);
      if (count < 3) return CARD_RATIO.xs;
      if (count < 4) return CARD_RATIO.sm;
      if (count < 5) return CARD_RATIO.md;
      if (count < 10) return CARD_RATIO.lg;
      return CARD_RATIO.xl;
    },
  };

  return (
    <Box>
      <Anchor underline="never">
        <Card
          key={post.id}
          shadow="sm"
          padding="lg"
          radius="md"
          withBorder
          className={
            classes.item +
            " " +
            classes[CARD_CLASSNAMES[index % CARD_CLASSNAMES.length]] +
            " " +
            classes[layoutCls]
          }
        >
          <Flex direction={"column"} justify={"space-between"} flex={1}>
            <Title className={classes.title}>{title}</Title>

            <Flex gap="xs" justify={"space-between"} align={"end"}>
              <Group flex={1}>
                <Badge
                  color="gray"
                  variant="default"
                  size="sm"
                  className={classes.category}
                >
                  {post.data.category}
                </Badge>
              </Group>

              <Group gap="xs" flex={0} miw="5em">
                {post.data.tag?.map((tag) => (
                  <Badge
                    key={tag}
                    className={classes.tag}
                    color="gray"
                    variant="transparent"
                    size="xs"
                  >
                    #{tag}
                  </Badge>
                ))}
              </Group>
            </Flex>
          </Flex>
        </Card>
      </Anchor>
      <Text size="sm" lineClamp={2} px={15} pt={10}>
        {post.excerpt}
      </Text>
    </Box>
  );
}
