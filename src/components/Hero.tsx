import {
  Avatar,
  Box,
  Container,
  Group,
  MantineProvider,
  Stack,
  Title,
  Text,
  Button,
  Divider,
} from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./Hero.module.css";

interface IProps {
  picture?: ReactNode;
}

export default function Hero({ picture }: IProps) {
  return (
    <MantineProvider>
      <Container size="xl">
        <Stack gap="xl">
          <Box py="xl">
            <Group align="center" gap="xl">
              <Avatar size={120} radius="xl" className={classes.avatar}>
                {picture}
              </Avatar>
              <Stack gap="md" flex={1}>
                <Title order={1} size="h1">
                  You found my secret garden!
                </Title>
                <Text size="lg" c="dimmed">
                  Talk about every thing here.
                </Text>
                <Group>
                  <Button>订阅更新</Button>
                  <Button variant="outline">关注我</Button>
                </Group>
              </Stack>
            </Group>
          </Box>
        </Stack>
      </Container>
      <Divider />
    </MantineProvider>
  );
}
