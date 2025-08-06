import {
  Anchor,
  Badge,
  Group,
  MantineProvider,
  Stack,
  Title,
} from "@mantine/core";

interface ITagsProps {
  tags: [name: string, url: string, count: number][];
}

export default function Tags({ tags }: ITagsProps) {
  return (
    <MantineProvider>
      <Stack gap="xl">
        <Stack gap="md">
          <Title order={3}># Tags</Title>
          <Group gap="xs">
            {tags.map(([name, url]) => (
              <TagItem key={name} tag={name} url={url} />
            ))}
          </Group>
        </Stack>
      </Stack>
    </MantineProvider>
  );
}

interface ITagItemProps {
  tag: string;
  url: string;
}

function TagItem({ tag, url }: ITagItemProps) {
  return (
    <Anchor href={url}>
      <Badge
        key={tag}
        variant="light"
        size="lg"
        style={{ cursor: "pointer" }}
      >
        {tag}
      </Badge>
    </Anchor>
  );
}
