import { SITE_TITLE } from "@/packages/consts";
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
import classes from "./mantineHeader.module.css";

interface IProps {
  links: { label: string; href: string }[];
}

export default function ({ links }: IProps) {
  return (
    <MantineProvider>
      <AppShell header={{ height: 70 }} padding="md">
        <AppShell.Header>
          <Container size="xl" h="100%">
            <Flex justify="space-between" align="center" h="100%">
              <Title order={2} c="blue.6">
                {SITE_TITLE}
              </Title>
              <Group gap="lg" visibleFrom="sm">
                {links.map((link) => (
                  <Anchor
                    key={link.label}
                    href={link.href}
                    className={classes.link}
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
