import {
  Anchor,
  AppShell,
  Container,
  Flex,
  Group,
  TextInput,
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
}

export default function MantineHeader({ links, title, pathname }: IProps) {
  const { headerHeight } = useStore(layoutStore)
  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md">
        {/*TODO: className="backdrop-blur supports-[backdrop-filter]:bg-background/60"*/}
        <AppShell.Header>
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
              {/* <TextInput
                placeholder="搜索文章..."
                value={""}
                onChange={(e) => {}}
                leftSection={<IconSearch size={16} />}
                w={300}
                radius="xl"
              /> */}
            </Flex>
          </Container>
        </AppShell.Header>
      </AppShell>
    </CustomMantineProvider>
  );
}
