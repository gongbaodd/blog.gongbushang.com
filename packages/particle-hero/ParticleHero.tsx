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
import { useDebouncedValue } from "@mantine/hooks";
import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { TooltipStackCarousel } from "@/packages/carousel/BlogCarousel";
import { $cardCache, requestCardPost } from "@/packages/carousel/card";
import type { IPost } from "@/packages/card/PostCard";
import App from "./core/App.js";
import LegendCategoryChips from "./components/LegendCategoryChips";
import LegendYearSlider from "./components/LegendYearSlider";
import { usePostFilter } from "./usePostFilter";
import {
  getCategoryColor,
  getFilterOptions,
  type PostFilterState,
  type UmapPost,
} from "./postsData";
import {
  getParticleLayoutModeForViewport,
  PARTICLE_LAYOUT_BELOW_LARGE_MQ,
  PARTICLE_LAYOUT_LANDSCAPE,
  PARTICLE_LAYOUT_SQUARE,
} from "./layout";
import classes from "./ParticleHero.module.css";

export type { UmapPost } from "./postsData";

export {
  PARTICLE_LAYOUT_BELOW_LARGE_MQ,
  PARTICLE_LAYOUT_LANDSCAPE,
  PARTICLE_LAYOUT_SQUARE,
  getParticleLayoutModeForViewport,
} from "./layout";

/** Landscape sampling resolution (desktop, ≥62em) */
export const PARTICLE_VIEW_WIDTH = PARTICLE_LAYOUT_LANDSCAPE.width;
export const PARTICLE_VIEW_HEIGHT = PARTICLE_LAYOUT_LANDSCAPE.height;
/** Square sampling resolution (below 62em) */
export const PARTICLE_VIEW_SQUARE_SIZE = PARTICLE_LAYOUT_SQUARE.width;
export const PARTICLE_VIEW_DISPLAY_HEIGHT = 600;

export interface IGalleryImage {
  url: string;
  traceSvg?: string;
  colorSet?: {
    bgColor: string;
    titleColor: string;
  };
}

export interface IParticleHeroProps {
  posts: UmapPost[];
  galleryImage?: IGalleryImage;
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

function traceSvgToCssBackground(traceSvg?: string): string | undefined {
  if (!traceSvg) return undefined;
  return `url("data:image/svg+xml,${encodeURIComponent(traceSvg)}")`;
}

export default function ParticleHero({
  posts,
  galleryImage,
  title,
  description,
}: IParticleHeroProps) {
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
  const [webglFailed, setWebglFailed] = useState(false);
  const [tooltip, setTooltip] = useState<ITooltipState | null>(null);
  const [hoveredPostId, setHoveredPostId] = useState<string | null>(null);
  const [cardStack, setCardStack] = useState<string[]>([]);
  const [debouncedHoveredId] = useDebouncedValue(hoveredPostId, 300);
  const cardCache = useStore($cardCache);

  useEffect(() => {
    if (!debouncedHoveredId) return;
    setCardStack((prev) => {
      const next = [
        debouncedHoveredId,
        ...prev.filter((id) => id !== debouncedHoveredId),
      ];
      return next.slice(0, 5);
    });
  }, [debouncedHoveredId]);

  useEffect(() => {
    if (cardStack.length === 0) return;
    const cached = $cardCache.get();
    void Promise.all(
      cardStack
        .filter((id) => !cached[id])
        .map((id) => requestCardPost(id)),
    );
  }, [cardStack]);

  const stackPosts = useMemo(
    () =>
      cardStack
        .map((id) => cardCache[id])
        .filter((post): post is IPost => post != null),
    [cardStack, cardCache],
  );

  const placeholderStyle = useMemo((): CSSProperties | undefined => {
    if (!galleryImage?.traceSvg && !galleryImage?.colorSet?.bgColor) return undefined;

    return {
      backgroundColor: galleryImage.colorSet?.bgColor,
      backgroundImage: traceSvgToCssBackground(galleryImage.traceSvg),
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }, [galleryImage]);

  const showPlaceholder = Boolean(placeholderStyle) && (loading || webglFailed);

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

  const filter = usePostFilter(posts, handleFilterChange);

  const loadScene = useCallback(
    async (app: InstanceType<typeof App>) => {
      if (galleryImage?.url) {
        await app.loadImage(galleryImage.url, posts);
      } else {
        await app.loadPosts(posts);
      }
      applyFilter();
    },
    [galleryImage?.url, posts, applyFilter],
  );

  useEffect(() => {
    filterRef.current = initialFilter;
  }, [initialFilter]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;

    setWebglFailed(false);

    let app: InstanceType<typeof App>;
    try {
      app = new App(container);
    } catch {
      setWebglFailed(true);
      setLoading(false);
      return;
    }

    if (app.webglFailed) {
      appRef.current = app;
      setWebglFailed(true);
      setLoading(false);
      return () => {
        void app.dispose();
        appRef.current = null;
      };
    }

    appRef.current = app;

    const syncLayoutMode = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        await app.setLayoutMode(getParticleLayoutModeForViewport());
        applyFilter();
      } finally {
        if (showLoading) setLoading(false);
      }
    };

    app.setHoverHandler((
      post: UmapPost | null,
      event?: { intersectionData?: { uv: { x: number; y: number } } },
    ) => {
      if (!post) {
        setTooltip(null);
        lastHoveredIdRef.current = null;
        setHoveredPostId(null);
        return;
      }

      const label = post.category?.label ?? "";
      const color = getCategoryColor(label);

      if (post.id !== lastHoveredIdRef.current) {
        lastHoveredIdRef.current = post.id;
        setHoveredPostId(post.id);
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

    const layoutMq = window.matchMedia(PARTICLE_LAYOUT_BELOW_LARGE_MQ);
    const onLayoutChange = () => {
      void syncLayoutMode(true);
    };
    layoutMq.addEventListener("change", onLayoutChange);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      app.update();
      app.draw();
    };
    animate();

    (async () => {
      setLoading(true);
      try {
        await syncLayoutMode(false);
        await loadScene(app);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      layoutMq.removeEventListener("change", onLayoutChange);
      resizeObserver.disconnect();
      void app.dispose();
      appRef.current = null;
    };
  }, [posts, applyFilter, loadScene]);

  return (
    <CustomMantineProvider>
      <Box py="xl" className={classes.hero}>
        <Stack gap="xl" className={classes.heroStack} justify="center">
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
              {filter.hasYears && (
                <Flex className={classes.legendChipsRow} justify="flex-end">
                  <LegendCategoryChips
                    categories={filter.categories}
                    selectedCategory={filter.selectedCategory}
                    onSelectCategory={filter.selectCategory}
                  />
                </Flex>
              )}

              <Card p={0} radius="lg" shadow="lg" className={classes.canvasCard}>
                <Flex className={classes.canvasContainer}>
                  {galleryImage && placeholderStyle && (
                    <Box
                      aria-hidden
                      className={
                        classes.canvasPlaceholder +
                        (showPlaceholder ? "" : " " + classes.canvasPlaceholderHidden)
                      }
                      style={placeholderStyle}
                    />
                  )}

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
                        (webglFailed ? " " + classes.canvasUnavailable : "") +
                        (!loading && !webglFailed ? " " + classes.loaded : "")
                      }
                    >
                      <Box ref={canvasRef} className={classes.canvasInner} />
                    </Flex>
                  </ReactErrorBoundary>
                </Flex>
              </Card>

              {filter.hasYears && (
                <Flex className={classes.legendYearRow} justify="flex-start">
                  <LegendYearSlider
                    years={filter.years}
                    yearIndex={filter.yearIndex}
                    onYearChange={filter.onYearChange}
                  />
                </Flex>
              )}
            </Stack>

            {description && cardStack.length > 0 ? (
              <Stack
                gap="md"
                className={`${classes.contentPanel} ${classes.contentPanelCarousel}`}
              >
                <TooltipStackCarousel
                  posts={stackPosts}
                  onClose={() => setCardStack([])}
                  className={classes.carouselPanel}
                  closeClassName={classes.carouselClose}
                />
              </Stack>
            ) : description ? (
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
            ) : null}
          </Group>
        </Stack>
      </Box>
      <Divider />
    </CustomMantineProvider>
  );
}
