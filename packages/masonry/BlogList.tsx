import {
  Stack,
  Button,
  Center,
} from "@mantine/core";
import { Masonry } from "@mui/lab";
import classes from "./BlogList.module.css";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { useLayoutEffect, useRef, useState } from "react";
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
  const [className, setClassName] = useState([classes.list, classes.invisible].join(" "))
  const [showSSR, setShowSSR] = useState(true)

  useLayoutEffect(() => {
    setTimeout(() => {
      setClassName(classes.list)
      setShowSSR(false)
    }, 0)
  }, [])

  const Client = () => (
    <CustomMantineProvider key={"client"}>
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
  )

  return (
    <>
    {showSSR && <BlogGridSSR />}
    <Client />
    </>
  );
}

type T_SIZE = "sm" | "md" | "lg" | "xl";

export function BlogGridSSR() {
  const posts = useStore($posts);

  const displays = {
    sm: "none",
    md: "none",
    lg: "none",
    xl: "none",
  };

  return (
    <>
      {
        Object.keys(displays).map(_size => {
          const size: T_SIZE = _size as unknown as any

          const { columns } = {
            get columns() {
              return COLUMNS_STYLE[size];
            },
          };

          const ds = {...displays}
          ds[size] = "flex";

          return (
            <CustomMantineProvider key={size}>
              <Masonry
                columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }}
                spacing={3}
                sequential
                defaultColumns={columns}
                defaultHeight={COLUMNS_SSR_HEIGHT[size]}
                defaultSpacing={3}
                sx={{ display: ds }}
                className={classes.masonrySSR}
              >
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </Masonry>
            </CustomMantineProvider>
          )
        })
      }
    </>
  );
}
