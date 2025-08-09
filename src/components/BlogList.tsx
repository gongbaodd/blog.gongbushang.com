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
  Center,
} from "@mantine/core";
import {
  IconBook,
  IconCalendar,
  IconFolder,
  IconHeart,
  IconMessageCircle,
  IconSearch,
  IconShare,
  IconTag,
  type ReactNode,
} from "@tabler/icons-react";
import { Masonry } from "@mui/lab";
import classes from "./BlogList.module.css";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import {
  FILTER_ENTRY,
  POST_CARD_CLASSNAMES,
  POST_CARD_LAYOUT,
} from "@/packages/consts";
import { IconQuoteFilled } from "@tabler/icons-react";
import { Fragment } from "react/jsx-runtime";
import wordcount from "word-count";
import { ThemeProvider } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  $hasMorePosts,
  $posts,
  $postsListParams,
  requestPosts,
} from "../stores/posts";
import { useStore } from "@nanostores/react";

interface Props {
  posts: IPost[];
  menuCategory?: ReactNode;
  menuSeries?: ReactNode;
  menuTag?: ReactNode;
  blogGrid?: ReactNode;
  blogGridxs?: ReactNode;
  blogGridsm?: ReactNode;
  blogGridmd?: ReactNode;
  blogGridlg?: ReactNode;
  blogGridxl?: ReactNode;
}

export interface IPost {
  id: string;
  href: string;
  title: string;
  date: Date;
  data: {
    category: string;
    tag?: string[];
    [T: string]: any;
  };
  excerpt: string;
}

export default function BlogList({
  blogGrid,
  blogGridxs,
  blogGridsm,
  blogGridmd,
  blogGridlg,
  blogGridxl,
  menuCategory,
  menuSeries,
  menuTag,
}: Props) {
  return (
    <CustomMantineProvider>
      <Container fluid>
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 1 }}>
            <Stack gap="lg">
              <Fragment key={"category"}>{menuCategory}</Fragment>
              <Fragment key={"series"}>{menuSeries}</Fragment>
              <Fragment key={"tag"}>{menuTag}</Fragment>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 11 }}>
            <Stack>
            <Fragment key={"xs"}>{blogGridxs}</Fragment>
            <Fragment key={"sm"}>{blogGridsm}</Fragment>
            <Fragment key={"md"}>{blogGridmd}</Fragment>
            <Fragment key={"lg"}>{blogGridlg}</Fragment>
            <Fragment key={"xl"}>{blogGridxl}</Fragment>
            <Fragment key={"client"}>{blogGrid}</Fragment>
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>
    </CustomMantineProvider>
  );
}

interface IStoreProps {
  posts: IPost[];
  filter: string;
  entryType?: FILTER_ENTRY;
  totalCount: number;
}

export function BlogListNanoStore({
  posts,
  filter,
  entryType,
  totalCount,
}: IStoreProps) {
  useEffect(() => {
    $posts.set(posts);
    $postsListParams.set({ filter, entryType, page: 0, totalCount });
  }, []);

  return <></>;
}

const COLUMNS_STYLE = { xs: 1, sm: 2, md: 3, lg: 4, xl: 5 };
const COLUMNS_SSR_HEIGHT = {
  xl: 2000,
  lg: 2000,
  md: 2500,
  sm: 3500,
  xs: undefined,
};

export function BlogGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const posts = useStore($posts);

  useEffect(() => {
    if (!ref.current) return;
    const parent = ref.current.parentNode?.parentNode;
    const observer = new MutationObserver(() => {
      parent?.querySelectorAll("." + classes.masonrySSR).forEach((node) => {
        node.className += " " + classes.hide;
      });

      observer.disconnect();
    });

    observer.observe(ref.current, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    return () => observer.disconnect();
  }, []);

  return (
    <CustomMantineProvider>
        <Masonry
          ref={ref}
          columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
          spacing={3}
          sequential
        >
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} index={i} />
          ))}
        </Masonry>
        {$hasMorePosts.get() && (
          <Center>
            <Button variant="default" onClick={() => requestPosts()}>
              Load More
            </Button>
          </Center>
        )}
    </CustomMantineProvider>
  );
}

type T_SIZE = "xs" | "sm" | "md" | "lg" | "xl";

export function BlogGridSSR({ size, posts }: { size: T_SIZE, posts: IPost[] }) {
  const { columns } = {
    get columns() {
      return COLUMNS_STYLE[size];
    },
  };

  const displays = {
    xs: "none",
    sm: "none",
    md: "none",
    lg: "none",
    xl: "none",
  };

  displays[size] = "flex";

  return (
    <CustomMantineProvider>
      <Masonry
        columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
        spacing={3}
        sequential
        defaultColumns={columns}
        defaultHeight={COLUMNS_SSR_HEIGHT[size]}
        defaultSpacing={3}
        sx={{ display: displays }}
        className={classes.masonrySSR}
      >
        {posts.map((post, i) => (
          <PostCard key={post.id} post={post} index={i} />
        ))}
      </Masonry>
    </CustomMantineProvider>
  );
}

type TLink = { label: string; href: string };

export function MenuCategory({ categories }: { categories: TLink[] }) {
  return (
    <CustomMantineProvider>
      <Stack gap="sm">
        <Group>
          <IconFolder size={20} />
          <Text fw={600} size="lg">
            Category
          </Text>
        </Group>
        <Stack gap="xs">
          {categories.map(({ label, href }) => (
            <Anchor href={href} key={label}>
              <Button
                variant={"default"}
                color="blue"
                justify="flex-start"
                fullWidth
                size="sm"
              >
                {label}
              </Button>
            </Anchor>
          ))}
        </Stack>
      </Stack>
    </CustomMantineProvider>
  );
}

export function MenuSeries({ series }: { series: TLink[] }) {
  return (
    <CustomMantineProvider>
      <Stack gap="sm">
        <Group>
          <IconBook size={20} />
          <Text fw={600} size="lg">
            Series
          </Text>
        </Group>
        <Stack gap="xs">
          {series.map(({ label, href }) => (
            <Anchor href={href} key={label}>
              <Button
                variant={"default"}
                color="blue"
                justify="flex-start"
                fullWidth
                size="sm"
              >
                {label}
              </Button>
            </Anchor>
          ))}
        </Stack>
      </Stack>
    </CustomMantineProvider>
  );
}

export function MenuTag({ tags }: { tags: TLink[] }) {
  return (
    <CustomMantineProvider>
      <Stack gap="sm">
        <Group>
          <IconTag size={20} />
          <Text fw={600} size="lg">
            Tags
          </Text>
        </Group>
        <Group gap="xs">
          {tags.map(({ label, href }) => (
            <Anchor href={href} key={label}>
              <Badge
                variant={"outline"}
                color="green"
                style={{ cursor: "pointer" }}
                size="sm"
              >
                {label}
              </Badge>
            </Anchor>
          ))}
        </Group>
      </Stack>
    </CustomMantineProvider>
  );
}

function PostCard({ post, index }: { post: IPost; index: number }) {
  const title = post.title;

  const { layoutCls } = {
    get layoutCls() {
      const count = wordcount(title) + (post.data.tag?.length ?? 0);
      if (count < 3) return POST_CARD_LAYOUT.xs;
      if (count < 4) return POST_CARD_LAYOUT.sm;
      if (count < 5) return POST_CARD_LAYOUT.md;
      if (count < 10) return POST_CARD_LAYOUT.lg;
      return POST_CARD_LAYOUT.xl;
    },
  };

  return (
    <Box>
      <Anchor underline="never" href={post.href}>
        <Card
          key={post.id}
          shadow="sm"
          padding="lg"
          radius="md"
          withBorder
          className={
            classes.item +
            " " +
            classes[POST_CARD_CLASSNAMES[index % POST_CARD_CLASSNAMES.length]] +
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
      <Flex pl={5} pr={10} pt={5}>
        <Avatar
          size="xs"
          variant="transparent"
          style={{ transform: "rotateZ(180deg)" }}
        >
          <IconQuoteFilled />
        </Avatar>
        <Text size="sm" lineClamp={2} className={classes.excerpt}>
          {post.excerpt}
        </Text>
      </Flex>
    </Box>
  );
}
