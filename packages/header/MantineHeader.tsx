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
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { prefetch } from "astro:prefetch";
import { navigate } from "astro:transitions/client";
import { ROUTE_LABEL } from "../consts";


const Icons: Record<string, JSX.Element> = {
  [ROUTE_LABEL.Home]: <Home size="16" />,
  [ROUTE_LABEL.Blog]: <Notebook size="16" />,
  [ROUTE_LABEL.World]: <Plane size="16" />,
  [ROUTE_LABEL.Archive]: <Folder size="16" />,
}

interface IProps {
  searchNode?: React.ReactNode;
  loaderHome?: ReactNode;
  loaderBlog?: ReactNode;
  loaderWorld?: ReactNode;
  loaderArchive?: ReactNode;
}

export default function MantineHeader({ searchNode, loaderHome, loaderArchive, loaderBlog, loaderWorld }: IProps) {
  const loaders: Record<ROUTE_LABEL, ReactNode | undefined> = {
    [ROUTE_LABEL.Home]: loaderHome,
    [ROUTE_LABEL.Blog]: loaderBlog,
    [ROUTE_LABEL.World]: loaderWorld,
    [ROUTE_LABEL.Archive]: loaderArchive,
  }

  const { headerHeight } = useStore(layoutStore)
  const title = useStore($title);
  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md" >
        <AppShell.Header className={classes.header}>
          <Container h="100%" fluid>
            <Flex justify="space-between" align="center" h="100%">
              <NavDrawer />
              <TitleNode />
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

  function TitleNode() {
    const pathname = useStore($pathname)
    if (pathname == "/") {
      return <Title> {title} </Title>
    } else {
      return (
        <Anchor href="/">
          <Title> {title} </Title>
        </Anchor>)
    }
  }

  function NavLinks() {
    const links = useStore($links)
    return links.map((link, i) => <NavLink key={i} link={link} />)
  }

  function NavLink({ link }: { link: ILink }) {
    const pathname = useStore($pathname)
    const isCurrent = link.href === pathname
    const [isLoading, setIsLoading] = useState(false)
    const loader = loaders && loaders[link.label]

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
        {isLoading? <Loader size={16}/>:Icons[link.label]}
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
        <Group style={{ position: "relative" }}>
          <Anchor
            className={classes.link}
            key={link.label}
            href={link.href}
            py="xs"
            onClick={onClickHandler}
          >
            <Content />
          </Anchor>
          {isLoading && <div className={classes.loader}>{loader}</div>}
        </Group>
      )
    }

  }

  function NavDrawer() {
    const [opened, { open, close }] = useDisclosure(false);
    return (
      <>
        <Drawer opened={opened} onClose={close} title="Navigation" position="bottom" overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}>
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

}
