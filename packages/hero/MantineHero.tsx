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
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";

interface IProps {
  title?: ReactNode;
  description?: ReactNode;
}

export default function Hero({ title, description }: IProps) {
  const [modelLoaded, setModelLoaded] = useState(false)

  return (
    <CustomMantineProvider>
      <Box py="xl" className={classes.hero}>
        <Group align="center" gap={"xl"} justify="center">
          <Card p={0} radius={"lg"} shadow="lg">
            <Flex className={classes.avatarContainer}>
              <Center className={classes.placeholder} dangerouslySetInnerHTML={{ __html: profile }}></Center>
              <ReactErrorBoundary label="Hero lanyard failed to render">
                <Flex flex={1} className={classes.lanyard + (modelLoaded ? " " + classes.loaded : "")}>
                  <Lanyard position={[0, 0, 12]} gravity={[0, -40, 0]} onLoad={() => setModelLoaded(true)} />
                </Flex>
              </ReactErrorBoundary>
            </Flex>
          </Card>

          <Stack gap="xl">
            <HeroContent title={title} description={description} />
            <Group align="center" justify="center">
              {/* <Button>订阅更新</Button> */}
              <Button  onClick={_ => location.href = "#socials"}>Follow me in social media</Button>
            </Group>
          </Stack>
        </Group>
      </Box>
      <Divider />
    </CustomMantineProvider>
  );
}

function HeroContent({
  title,
  description,
}: {
  title?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <Stack gap="md" p="md">
      {title && <Typography component="div">{title}</Typography>}
      {description && <Typography component="div">{description}</Typography>}
    </Stack>
  );
}
