import {
  Anchor,
  AppShell,
  Button,
  Container,
  Divider,
  Drawer,
  Flex,
  Group,
  Stack,
  Title,
  Text,
  Loader,
} from "@mantine/core";
import classes from "./MantineHeader.module.css";
import { useStore } from "@nanostores/react";
import layoutStore from "../../src/stores/layout";
import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Notebook, Folder, Home, Menu, Plane } from "lucide-react";
import { useDisclosure } from "@mantine/hooks";
import { $links, type ILink } from "./store/links";
import { $pathname } from "./store/pathname";
import { $title } from "./store/title";
import { useCallback, useEffect, useState } from "react";
import { prefetch } from "astro:prefetch";
import { navigate } from "astro:transitions/client";

interface IProps {
  searchNode?: React.ReactNode;
}

export default function MantineHeader({ searchNode }: IProps) {
  const { headerHeight } = useStore(layoutStore)
  const title = useStore($title);
  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md" >
        <AppShell.Header className={classes.header}>
          <Container h="100%" fluid>
            <Flex justify="space-between" align="center" h="100%">
              <NavDrawer />
              <Anchor href="/">
                <Title> {title} </Title>
              </Anchor>
              <Group gap="lg" visibleFrom="sm">
                <NavLinks />
              </Group>
              {searchNode}
            </Flex>
          </Container>
        </AppShell.Header>
      </AppShell>
    </CustomMantineProvider>
  );
}

const Icons: Record<string, JSX.Element> = {
  Home: <Home size="16" />,
  Blog: <Notebook size="16" />,
  World: <Plane size="16" />,
  Archive: <Folder size="16" />,
}

function NavLinks() {
  const links = useStore($links)
  return links.map((link, i) => <NavLink key={i} link={link} />)
}

function NavLink({ link }: { link: ILink }) {
  const pathname = useStore($pathname)
  const isCurrent = link.href === pathname
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      const isCurrent = link.href === pathname
      if (!isCurrent) prefetch(link.href)
    }, 100)
  }, [link])

  const onClickHandler = useCallback(async (e: any) => {
    e.preventDefault()
    setIsLoading(true)
    await navigate(link.href)
    setIsLoading(false)
  }, [link])

  const Content = () => (
  <Flex gap="xs" align={"center"}>
    {isLoading ? <Loader size={16} /> : Icons[link.label]}
    <Text>{link.label}</Text>
  </Flex>)

  if (isCurrent) {
    return (
      <Group key={link.label} className={[classes.link, classes.active].join(" ")}>
        <Content />
      </Group>
    )
  } else {
    return (
      <Anchor
        className={classes.link}
        key={link.label}
        href={link.href}
        py="xs"
        onClick={onClickHandler}
      >
        <Content />
      </Anchor>
    )
  }

}

function NavDrawer() {
  const [opened, { open, close }] = useDisclosure(false);
  return (
    <>
      <Drawer opened={opened} onClose={close} title="Navigation" position="bottom"  overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}>
        <Divider />
        <Stack w={"100%"} gap="xl" mt={"xl"}>
          <NavLinks />
        </Stack>
      </Drawer>
      <Button
        hiddenFrom="sm"
        variant="transparent"
        radius={"xl"} c="dimmed"
        style={{ borderColor: "var(--mantine-color-dimmed)" }}
        onClick={open}
      >
        <Menu />
      </Button>
    </>

  )
}
