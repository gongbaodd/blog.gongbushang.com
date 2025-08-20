import {
  Avatar,
  Box,
  Group,
  Stack,
  Title,
  Text,
  Button,
  Divider,
  Flex,
  Card,
  Center,
} from "@mantine/core";
import classes from "./Hero.module.css";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import Lanyard from "../bits/Components/Lanyard/Lanyard";
import profile from "../icons/profile.svg?raw"
import { useState } from "react";


interface IProps {
}

export default function Hero({}: IProps) {
  const [ modelLoaded, setModelLoaded ] = useState(false)

  return (
    <CustomMantineProvider>
      <Box py="xl">
        <Group align="center" gap={"xl"} justify="center">
          <Card p={0} radius={"lg"} shadow="lg">
            <Flex w={600} h={600} style={{ position: "relative" }}>
              <Center className={classes.placeholder} dangerouslySetInnerHTML={{__html: profile}}></Center>
              <Flex flex={1} className={classes.lanyard + (modelLoaded ? " " + classes.loaded: "")}>
                <Lanyard position={[0, 0, 12]} gravity={[0, -40, 0]} onLoad={() => setModelLoaded(true)} />
              </Flex>
            </Flex>
          </Card>

          <Stack gap="md">
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
