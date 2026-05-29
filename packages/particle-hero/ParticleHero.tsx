import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Flex,
  Group,
  Paper,
  Stack,
  Text,
  Typography,
} from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import App from "./core/App.js";
import ImagePicker, { POSTS_ITEM_ID } from "./components/ImagePicker";
import LegendFilter from "./components/LegendFilter";
import {
  getCategoryColor,
  getFilterOptions,
  type PostFilterState,
  type UmapPost,
} from "./postsData";
import classes from "./ParticleHero.module.css";

export type { UmapPost } from "./postsData";

/** Matches particle sampling resolution in `core/Particles.js` */
export const PARTICLE_VIEW_WIDTH = 320;
export const PARTICLE_VIEW_HEIGHT = 180;
export const PARTICLE_VIEW_DISPLAY_HEIGHT = 600;

export interface IParticleHeroProps {
  posts: UmapPost[];
  title?: ReactNode;
  description?: ReactNode;
}

interface ITooltipState {
  title: string;
  categoryLabel: string;
  color: string;
  left: number;
  top: number;
}

export default function ParticleHero({ posts, title, description }: IParticleHeroProps) {
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
  const [activePickerId, setActivePickerId] = useState(POSTS_ITEM_ID);
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
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      app.update();
      app.draw();
    };
    animate();

    (async () => {
      setLoading(true);
      try {
        await app.loadPosts(posts);
        applyFilter();
        setActivePickerId(POSTS_ITEM_ID);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      void app.dispose();
      appRef.current = null;
    };
  }, [posts, applyFilter]);

  return (
    <CustomMantineProvider>
      <Box py="xl" className={classes.hero}>
        <Stack gap="xl" className={classes.heroStack}>
          {title && (
            <Typography component="div" className={classes.heroTitle}>
              {title}
            </Typography>
          )}

          <Group
            className={classes.heroGroup}
            align="center"
            gap="xl"
            justify="center"
          >
            <Stack gap="md" className={classes.canvasColumn}>
              <Card p={0} radius="lg" shadow="lg" className={classes.canvasCard}>
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
            </Stack>

            {description && (
              <Stack gap="xl" className={classes.contentPanel} justify="space-between">
                <Typography component="div" p="md" className={classes.contentText}>
                  {description}
                </Typography>
                <Group align="center" className={classes.contentActions}>
                  <Button onClick={() => { location.href = "#socials"; }}>
                    Follow me in social media
                  </Button>
                </Group>
              </Stack>
            )}
          </Group>
        </Stack>
      </Box>
      <Divider />
    </CustomMantineProvider>
  );
}
