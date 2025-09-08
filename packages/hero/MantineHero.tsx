import {
  Box,
  Group,
  Stack,
  Button,
  Divider,
  Flex,
  Card,
  Center,
  Typography
} from "@mantine/core";
import classes from "./Hero.module.css";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import Lanyard from "@/src/bits/Components/Lanyard/Lanyard";
import profile from "@/src/icons/profile.svg?raw"
import { useState, type ReactNode } from "react";

interface IProps {
  children: ReactNode
}

export default function Hero({ children }: IProps) {
  const [modelLoaded, setModelLoaded] = useState(false)

  return (
    <CustomMantineProvider>
      <Box py="xl" className={classes.hero}>
        <Group align="center" gap={"xl"} justify="center">
          <Card p={0} radius={"lg"} shadow="lg">
            <Flex className={classes.avatarContainer}>
              <Center className={classes.placeholder} dangerouslySetInnerHTML={{ __html: profile }}></Center>
              <Flex flex={1} className={classes.lanyard + (modelLoaded ? " " + classes.loaded : "")}>
                <Lanyard position={[0, 0, 12]} gravity={[0, -40, 0]} onLoad={() => setModelLoaded(true)} />
              </Flex>
            </Flex>
          </Card>

          <Stack gap="xl">
            <HeroContent>
              {children}
            </HeroContent>
            <Group>
              {/* <Button>订阅更新</Button> */}
              <Button  onClick={_ => location.href = "/#socials"}>Follow me in social media</Button>
            </Group>
          </Stack>
        </Group>
      </Box>
      <Divider />
    </CustomMantineProvider>
  );
}

function HeroContent({ children }: { children: ReactNode }) {
  return (
    <Typography p={"md"}>
      {children}
    </Typography>
  )
}
