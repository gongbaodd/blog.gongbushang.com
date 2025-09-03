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
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { navigate } from "astro:transitions/client";
import { ROUTE_HREF, ROUTE_LABEL, ROUTES } from "../consts";
import { Carousel as MantineCarousel } from "@mantine/carousel";
import { $pathnameNormalized } from "./store/pathname";
import MantineAnchor from "@/src/components/MantineAnchor";

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
  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md" >
        <AppShell.Header className={classes.header}>
          <Container h="100%" fluid>
            <Flex justify="space-between" align="center" h="100%" style={{ viewTransitionName: "header" }}>
              <NavDrawer />
              <TitleNode />
              <NavLinks />
              {searchNode}
            </Flex>
          </Container>
        </AppShell.Header>
      </AppShell>
    </CustomMantineProvider>
  );

  function TitleNode() {
    const title = "GrowGen"

    return <MantineAnchor href={ROUTE_HREF.Home} render={({ isLoading }) => {
      return (
        <Flex align={"center"}>
          <Title> {title}</Title>
          <Flex pl="xs" className="">
            <Title visibleFrom="md">给我</Title>
            {isLoading ?
              <Flex align={"center"} px={"xs"}><Loader size={28} /></Flex> :
              <Title>整</Title>
            }
          </Flex>
        </Flex>)
    }} />
  }

  function NavLinks() {
    const links = useStore($links)
    return (
      <Group gap="lg" visibleFrom="sm">
        {links.map((link, i) => <NavLink key={i} link={link} />)}
      </Group>
    )
  }

  function NavLink({ link }: { link: ILink }) {
    return <MantineAnchor
      key={link.label}
      href={link.href as ROUTE_HREF}
      render={({ isLoading, isCurrent }) => {
        const className = isCurrent ? [classes.link, classes.active].join(" ") : classes.link

        return (<Group className={className}>
          <Flex gap="xs" align={"center"}>
            {isLoading ? <Loader size={16} /> : Icons[link.label]}
            <Text>{link.label}</Text>
          </Flex>
        </Group>)
      }}
    />
  }

  function NavDrawer() {
    const [opened, { open, close }] = useDisclosure(false);
    const links = useStore($links)
    const pathname = useStore($pathnameNormalized)
    return (
      <>
        <Drawer opened={opened} onClose={close} title="Navigation" position="bottom" overlayProps={{ backgroundOpacity: 0.5, blur: 4 }}>
          <Divider />
          <Stack w={"100%"} gap="xl" mt={"xl"}>
            <MantineCarousel
              height={"100%"}
              slideSize="50%"
              slideGap="lg"
              controlsOffset="lg"
              controlSize={40}
              withControls
              emblaOptions={{ dragFree: true, align: 'start' }}
            >
              {links.filter(link => link.href !== pathname).map((link) => {
                return <NavDrawerItem key={link.label} link={link} />
              })}
            </MantineCarousel>
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

  function NavDrawerItem({ link }: { link: ILink }) {
    const loader = loaders && loaders[link.label]
    const { isLoading, onClickHandler } = usePreFetch(link)
    return (
      <MantineCarousel.Slide display={"flex"} style={{ justifyContent: "center", alignItems: "center" }}>
        <Anchor
          className={classes.link}
          key={link.label}
          href={link.href}
          py="xs"
          onClick={onClickHandler}
        >
          <Stack>
            {loader}
            <Flex gap="xs" align={"center"}>
              {isLoading ? <Loader size={16} /> : Icons[link.label]}
              <Text>{link.label}</Text>
            </Flex>
          </Stack>
        </Anchor>
      </MantineCarousel.Slide>
    )
  }

}


function usePreFetch(link: ILink) {
  const pathname = useStore($pathnameNormalized)
  const isCurrent = link.href === pathname
  const [isLoading, setIsLoading] = useState(false)
  const onClickHandler = useCallback(async (e: any) => {
    e.preventDefault()
    setIsLoading(true)
    await navigate(link.href)
    setIsLoading(false)
  }, [link])

  // useEffect(() => {
  //   setTimeout(() => {
  //     if (!isCurrent) prefetch(link.href)
  //   }, 100)
  // }, [link])

  return {
    isCurrent,
    isLoading,
    onClickHandler,
  }
}