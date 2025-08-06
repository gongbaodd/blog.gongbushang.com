import {
  Box,
  Button,
  Card,
  Grid,
  Group,
  MantineProvider,
  Stack,
} from "@mantine/core";
import { useState } from "react";
import Skeleton from "react-loading-skeleton";
import classes from "./SpotifyPlayer.module.css";

export default function SpotifyPlayer() {
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);

  return (
    <MantineProvider withGlobalClasses withCssVariables>
      <Stack gap="xl">
        <Card
          shadow="sm"
          padding={0}
          radius="lg"
          withBorder
          className={classes.card}
        >
          <Box p="md">
            <Grid align="center">
              <Grid.Col span={2}>
                <Skeleton circle width={116} height={116} />
              </Grid.Col>
              <Grid.Col span={10}>
                <Stack>
                  <Skeleton height={20} width="80%" />
                  <Skeleton height={16} width="60%" />
                  <Skeleton height={14} width="90%" count={1} />
                </Stack>
              </Grid.Col>
            </Grid>
          </Box>
      
          {!opened && (
            <Stack className={classes.cookie} justify="center" align="center">
              <Group>
                <Button variant="default" onClick={() => setOpened(true)}>
                  🍪 Open Podcast Player
                </Button>
              </Group>
            </Stack>
          )}

          {opened && (
            <iframe
              data-testid="embed-iframe"
              src="https://open.spotify.com/embed/show/2FJoLvI0tAnjXO3t71Iswz?utm_source=generator&theme=1"
              width="100%"
              height="152"
              allowFullScreen={false}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              className={loaded ? classes.loaded : classes.unloaded}
              onLoad={() => {
                setLoaded(true);
              }}
            ></iframe>
          )}
        </Card>
      </Stack>
    </MantineProvider>
  );
}
