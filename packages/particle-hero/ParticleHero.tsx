import {
  Badge,
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import App from "./core/App.js";
import ImagePicker, {
  DEFAULT_IMAGE_ID,
  DEFAULT_IMAGE_URL,
  POSTS_ITEM_ID,
} from "./components/ImagePicker";
import LegendFilter from "./components/LegendFilter";
import {
  getCategoryColor,
  getFilterOptions,
  type PostFilterState,
  type UmapPost,
} from "./postsData";
import classes from "./ParticleHero.module.css";

export type { UmapPost } from "./postsData";

export interface IParticleHeroProps {
  posts: UmapPost[];
}

interface ITooltipState {
  title: string;
  categoryLabel: string;
  color: string;
  left: number;
  top: number;
}

export default function ParticleHero({ posts }: IParticleHeroProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<InstanceType<typeof App> | null>(null);
  const rafRef = useRef<number>(0);
  const lastHoveredIdRef = useRef<string | null>(null);

  const initialFilter = useMemo((): PostFilterState => {
    const { years } = getFilterOptions(posts);
    return { category: "all", year: years[years.length - 1] ?? "" };
  }, [posts]);

  const filterRef = useRef<PostFilterState>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [activePickerId, setActivePickerId] = useState(DEFAULT_IMAGE_ID);
  const [tooltip, setTooltip] = useState<ITooltipState | null>(null);

  const applyFilter = useCallback(() => {
    appRef.current?.setPostFilter(filterRef.current);
  }, []);

  const handleFilterChange = useCallback(
    (state: PostFilterState) => {
      filterRef.current = state;
      applyFilter();
    },
    [applyFilter],
  );

  const handleSelectPosts = useCallback(async () => {
    const app = appRef.current;
    if (!app) return;
    setLoading(true);
    try {
      await app.loadPosts(posts);
      applyFilter();
      setActivePickerId(POSTS_ITEM_ID);
    } finally {
      setLoading(false);
    }
  }, [posts, applyFilter]);

  const handleSelectImage = useCallback(
    async (url: string, id: string) => {
      const app = appRef.current;
      if (!app) return;
      setLoading(true);
      try {
        await app.loadImage(url, posts);
        applyFilter();
        setActivePickerId(id);
      } finally {
        setLoading(false);
      }
    },
    [posts, applyFilter],
  );

  useEffect(() => {
    filterRef.current = initialFilter;
  }, [initialFilter]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    const app = new App(container);
    appRef.current = app;

    app.setHoverHandler((
      post: UmapPost | null,
      event?: { intersectionData?: { uv: { x: number; y: number } } },
    ) => {
      if (!post) {
        setTooltip(null);
        lastHoveredIdRef.current = null;
        return;
      }

      const label = post.category?.label ?? "";
      const color = getCategoryColor(label);

      if (post.id !== lastHoveredIdRef.current) {
        lastHoveredIdRef.current = post.id;
        let left = 0;
        let top = 0;
        if (event?.intersectionData && app.renderer) {
          const canvas = app.renderer.domElement;
          const rect = canvas.getBoundingClientRect();
          left =
            rect.left + event.intersectionData.uv.x * rect.width;
          top =
            rect.top + (1 - event.intersectionData.uv.y) * rect.height;
        }
        setTooltip({
          title: post.title,
          categoryLabel: label,
          color,
          left,
          top,
        });
      } else if (event?.intersectionData && app.renderer) {
        const { uv } = event.intersectionData;
        const canvas = app.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const left = rect.left + uv.x * rect.width;
        const top = rect.top + (1 - uv.y) * rect.height;
        setTooltip((prev) => (prev ? { ...prev, left, top } : null));
      }
    });

    app.resize();
    const onResize = () => app.resize();
    window.addEventListener("resize", onResize);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      app.update();
      app.draw();
    };
    animate();

    (async () => {
      setLoading(true);
      try {
        await app.loadImage(DEFAULT_IMAGE_URL, posts);
        applyFilter();
        setActivePickerId(DEFAULT_IMAGE_ID);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      void app.dispose();
      appRef.current = null;
    };
  }, [posts, applyFilter]);

  return (
    <CustomMantineProvider>
      <Box py="xl" className={classes.hero}>
        <Group align="center" gap="xl" justify="center">
          <Card p={0} radius="lg" shadow="lg">
            <Flex className={classes.canvasContainer}>
              <LegendFilter posts={posts} onChange={handleFilterChange} />

              {tooltip && (
                <Paper
                  className={classes.tooltip}
                  p="sm"
                  radius="md"
                  shadow="md"
                  withBorder
                  aria-hidden={false}
                  style={{ left: tooltip.left, top: tooltip.top }}
                >
                  <Stack gap={4}>
                    <Text size="sm" fw={500} lineClamp={3}>
                      {tooltip.title}
                    </Text>
                    <Badge
                      size="xs"
                      variant="light"
                      style={{
                        background: `${tooltip.color}33`,
                        color: tooltip.color,
                      }}
                    >
                      {tooltip.categoryLabel}
                    </Badge>
                  </Stack>
                </Paper>
              )}

              <ReactErrorBoundary label="ParticleHero failed to render">
                <Flex
                  flex={1}
                  className={
                    classes.canvas +
                    (loading ? "" : " " + classes.loaded)
                  }
                >
                  <Box ref={canvasRef} className={classes.canvasInner} />
                </Flex>
              </ReactErrorBoundary>

              <ImagePicker
                activeId={activePickerId}
                loading={loading}
                onSelectPosts={handleSelectPosts}
                onSelectImage={handleSelectImage}
              />
            </Flex>
          </Card>
        </Group>
      </Box>
      <Divider />
    </CustomMantineProvider>
  );
}
