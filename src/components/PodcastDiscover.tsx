import { Paper, Stack, Title } from "@mantine/core";
import { Carousel as MantineCarousel } from "@mantine/carousel";
import { useMediaQuery } from "@mantine/hooks";
import { PodcastEpisodeCard } from "@/packages/card/PodcastEpisodeCard";
import { RevealCard } from "@/packages/card/RevealCard";
import classes from "@/packages/carousel/BlogCarousel.module.css";
import contentClasses from "@/packages/content/BlogContent.module.css";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import type { IPodcastEpisode } from "../stores/podcast";

interface IPodcastDiscoverProps {
  episodes: IPodcastEpisode[];
}

/** "More to discover" for an episode page: same carousel look as the blog's RelatePosts. */
export default function PodcastDiscover({ episodes }: IPodcastDiscoverProps) {
  const isDesktop = useMediaQuery("(min-width: 75em)") ?? false;

  if (episodes.length === 0) return null;

  return (
    <CustomMantineProvider>
      <Paper
        shadow="md"
        className={contentClasses.relates}
        radius="lg"
        p="lg"
        mt={isDesktop ? 0 : "xl"}
      >
        <Stack gap="md">
          <Title order={2} size="h3">
            More to discover
          </Title>
          <MantineCarousel
            orientation={isDesktop ? "vertical" : "horizontal"}
            slideSize={isDesktop ? "50%" : "80%"}
            height={
              isDesktop
                ? "calc(100dvh - 90px - 2 * var(--mantine-spacing-lg) - 2.5rem - var(--mantine-spacing-md))"
                : 560
            }
            slideGap={isDesktop ? "xs" : "lg"}
            controlsOffset="lg"
            controlSize={40}
            withControls
            withIndicators
            emblaOptions={{ dragFree: true, align: "start" }}
            className={[
              classes.carousel,
              isDesktop ? classes.vertical : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {episodes.map((episode) => (
              <MantineCarousel.Slide
                maw={300}
                key={episode.id}
                display="flex"
                style={{ justifyContent: "center", alignItems: "center" }}
              >
                <RevealCard id={episode.id} revealOnHydrate>
                  <PodcastEpisodeCard episode={episode} hideExcerpt />
                </RevealCard>
              </MantineCarousel.Slide>
            ))}
          </MantineCarousel>
        </Stack>
      </Paper>
    </CustomMantineProvider>
  );
}
