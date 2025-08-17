import {
  Container,
  Flex,
  Grid,
  Group,
  Stack,
  Title,
  Text,
  Button,
  Badge,
  Card,
  Box,
  Avatar,
  Anchor,
  Center,
  type MantineStyleProp,
} from "@mantine/core";
import { Masonry } from "@mui/lab";
import classes from "./BlogList.module.css";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { IconQuoteFilled } from "@tabler/icons-react";
import { Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  $hasMorePosts,
  $posts,
  requestPosts,
} from "../stores/posts";
import { useStore } from "@nanostores/react";
import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import type { TClientPost } from "@/packages/utils/post";

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

export interface IPost extends TClientPost {
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
      <Container fluid style={{ marginInline: "initial" }}>
        <Grid gutter="lg">
          <Grid.Col span={{ base: 12, md: 1.5 }}>
            <Stack gap="lg">
              <Fragment key={"category"}>{menuCategory}</Fragment>
              <Fragment key={"series"}>{menuSeries}</Fragment>
              <Fragment key={"tag"}>{menuTag}</Fragment>
            </Stack>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 10.5 }}>
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

const COLUMNS_STYLE = { xs: 1, sm: 2, md: 3, lg: 4, xl: 5 };
const COLUMNS_SSR_HEIGHT = {
  xl: 3500,
  lg: 3500,
  md: 3500,
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
          <PostCard key={post.id} post={post}/>
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
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </Masonry>
    </CustomMantineProvider>
  );
}

interface ICardProp { post: IPost; hideExcerpt?: boolean }

export function PostCard({ post, hideExcerpt }: ICardProp) {
  const title = post.title;

  const className = [
    classes.item,
    post.data.cover ? classes.with_bg : classes[post.data.bgClass],
    classes[post.data.layout]
  ].join(" ")

  const [coverImage, setCoverImage] = useState("")

  useEffect(() => {
    setCoverImage(c => {
      const { cover } = post.data
      if (cover) {
        if (typeof cover.url === "string") {
          return cover.url
        }
        return cover.url.src
      }
      return c
    })

  }, [post])

  const [coverOpacity, setCoverOpacity] = useState(0)

  useEffect(() => {
    if (!coverImage) return

    const img = new Image()
    img.src = coverImage
    img.onload = () => setCoverOpacity(1)
  }, [coverImage])

  const { tracedCover } = {
    get tracedCover() {
      const { trace } = post.data
      const encoded = encodeURIComponent(trace);
      const cssBg = `url("data:image/svg+xml,${encoded}")`;
      return cssBg
    }
  }

  return (
    <Box>
      <Anchor underline="never" href={post.href}>
        <Card
          key={post.id}
          shadow="sm"
          padding="lg"
          radius="md"
          withBorder
          className={className}
          style={{
            backgroundColor: post.data.bgColor,
            "--underline-color": `var(${post.data.titleColor})`,
            "--cover-opacity": coverOpacity,
            "--cover-image": `url(${coverImage})`,
            "--cover-trace": tracedCover
          }}
        >
          <Flex direction={"column"} justify={"space-between"} flex={1} className={classes.content}>
            <Badge
              color="gray"
              variant="default"
              size="sm"
              className={classes.category}
            >
              <Group gap={6}>
                <Calendar size={12} />
                <Text size="xs">{dayjs(post.date).format("YYYY-MM-DD")}</Text>
              </Group>
            </Badge>

            <Title className={classes.title}>
              <span>{title}</span>
            </Title>

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
                { post.data.tag?.map((tag: string) => (
                  <Badge
                    key={tag}
                    color="gray"
                    variant="default"
                    size="xs"
                    className={classes.category}
                  >
                    #{tag}
                  </Badge>
                ))}
              </Group>
            </Flex>
          </Flex>
        </Card>
      </Anchor>
      {!hideExcerpt && (
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
      )}
    </Box>
  );
}
