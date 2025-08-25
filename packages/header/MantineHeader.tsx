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
} from "@mantine/core";
import classes from "./MantineHeader.module.css";
import { useStore } from "@nanostores/react";
import layoutStore from "../../src/stores/layout";
import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import { Menu } from "lucide-react";
import { useDisclosure } from "@mantine/hooks";
import { $links } from "./store/links";
import { $pathname } from "./store/pathname";
import { $title } from "./store/title";

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

function NavLinks() {
  const links = useStore($links)
  const pathname = useStore($pathname)

  return links.map((link) => (
      <Anchor
        className={classes.link + (link.href === pathname ? ` ${classes.active}` : "")}
        key={link.label}
        href={link.href}
        py="xs"
      >
        {link.label}
      </Anchor>
    ))
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
