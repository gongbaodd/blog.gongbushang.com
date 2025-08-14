import {
  Avatar,
  Box,
  Group,
  Stack,
  Title,
  Text,
  Button,
  Divider,
} from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./Hero.module.css";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface IProps {
  picture?: ReactNode;
}

export default function Hero({ picture }: IProps) {
  return (
    <CustomMantineProvider>
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
                Sorry, making a little rebuilding, many functions are not available yet.
              </Text>
              <Group>
                <Button>订阅更新</Button>
                <Button variant="outline">关注我</Button>
              </Group>
            </Stack>
          </Group>
        </Box>
        <Divider />
    </CustomMantineProvider>
  );
}
