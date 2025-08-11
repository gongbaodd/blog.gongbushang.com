import {
  Anchor,
  AppShell,
  Button,
  Container,
  Flex,
  Group,
  Text,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import classes from "./MantineHeader.module.css";
import { useStore } from "@nanostores/react";
import layoutStore from "../stores/layout";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface IProps {
  links: { label: string; href: string }[];
  title: string;
  pathname: string;
  searchNode?: React.ReactNode
}

export default function MantineHeader({ links, title, pathname, searchNode }: IProps) {
  const { headerHeight } = useStore(layoutStore)
  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md" >
        <AppShell.Header className={classes.header}>
          <Container h="100%" fluid>
            <Flex justify="space-between" align="center" h="100%">
              <Anchor href="/">
                <Title order={2}>
                  {title}
                </Title>
              </Anchor>
              <Group gap="lg" visibleFrom="sm">
                {links.map((link) => (
                  <Anchor
                    className={classes.link + (link.href === pathname ? ` ${classes.active}` : "")}
                    key={link.label}
                    href={link.href}
                  >
                    {link.label}
                  </Anchor>
                ))}
              </Group>
              {searchNode}
            </Flex>
          </Container>
        </AppShell.Header>
      </AppShell>
    </CustomMantineProvider>
  );
}
