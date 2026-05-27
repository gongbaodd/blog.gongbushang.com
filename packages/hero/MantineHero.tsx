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
import { Component, useState, type ErrorInfo, type ReactNode } from "react";

interface IProps {
  children: ReactNode
}

interface IErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface IErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<IErrorBoundaryProps, IErrorBoundaryState> {
  state: IErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): IErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Hero lanyard failed to render:", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
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
              <ErrorBoundary>
                <Flex flex={1} className={classes.lanyard + (modelLoaded ? " " + classes.loaded : "")}>
                  <Lanyard position={[0, 0, 12]} gravity={[0, -40, 0]} onLoad={() => setModelLoaded(true)} />
                </Flex>
              </ErrorBoundary>
            </Flex>
          </Card>

          <Stack gap="xl">
            <HeroContent>
              {children}
            </HeroContent>
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

function HeroContent({ children }: { children: ReactNode }) {
  return (
    <Typography p={"md"}>
      {children}
    </Typography>
  )
}
