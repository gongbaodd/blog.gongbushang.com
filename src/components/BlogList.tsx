import { AppShell, Container, Flex, MantineProvider, TextInput, Title } from "@mantine/core";
import type { CollectionEntry } from "astro:content";
import { IconSearch } from "@tabler/icons-react";

interface Props {
  posts: CollectionEntry<"blog">[];
}

export default function BlogList(props: Props) {
  return (
    <MantineProvider>
      <List posts={props.posts}></List>
    </MantineProvider>
  );
}

function List(_: Props) {
  return (
    <AppShell>
      <Container size="xl" h="100%">
        <Flex justify="space-between" align="center" h="100%">
          <Title order={2} c="blue.6">
            我的博客
          </Title>
          <TextInput
            placeholder="搜索文章..."
            value={""}
            onChange={(e) => {}}
            leftSection={<IconSearch size={16} />}
            w={300}
            radius="xl"
          />
        </Flex>
      </Container>
    </AppShell>
  );
}
