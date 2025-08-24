import {
  Container,
  Grid,
  Stack,
  Button,
  Center,
} from "@mantine/core";
import { Masonry } from "@mui/lab";
import classes from "./BlogList.module.css";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  $hasMorePosts,
  $posts,
  requestPosts,
} from "@/src/stores/posts";
import { useStore } from "@nanostores/react";
import { PostCard, type IPost } from "@/packages/card/PostCard";

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
  const [className, setClassName] = useState([classes.list, classes.hide].join(" "))

  useLayoutEffect(() => {
          setClassName(classes.list)

  }, [])

  return (
    <CustomMantineProvider>
      <Stack className={className}>
        <Masonry
          ref={ref}
          columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
          spacing={3}
          sequential
        >
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} />
          ))}
        </Masonry>
        {$hasMorePosts.get() && (
          <Center w={"100%"}>
            <Button variant="default" onClick={() => requestPosts()}>
              Load More
            </Button>
          </Center>
        )}
      </Stack>
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
