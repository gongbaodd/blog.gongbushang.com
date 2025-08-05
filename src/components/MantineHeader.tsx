import {
  Anchor,
  AppShell,
  Container,
  Flex,
  Group,
  MantineProvider,
  TextInput,
  Title,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import classes from "./MantineHeader.module.css";

interface IProps {
  links: { label: string; href: string }[];
  title: string;
  pathname: string;
}

export default function MantineHeader({ links, title, pathname }: IProps) {
  return (
    <MantineProvider>
      <AppShell header={{ height: 70 }} padding="md">
        <AppShell.Header className="backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Container size="xl" h="100%">
            <Flex justify="space-between" align="center" h="100%">
              <Title order={2} c="blue.6">
                {title}
              </Title>
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
    </MantineProvider>
  );
}
