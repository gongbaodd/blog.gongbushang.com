import {
  Anchor,
  Badge,
  Button,
  Group,
  MantineProvider,
  Stack,
  Title,
} from "@mantine/core";
import classes from "./Tags.module.css";
import {
  useDeferredValue,
  useState,
  useTransition,
  type ReactNode,
} from "react";

interface ITagsProps {
  tagGroup?: ReactNode;
}

export default function Tags({ tagGroup }: ITagsProps) {
  const [isAll, setIsAll] = useState(false);

  return (
    <MantineProvider>
      <Stack
        gap="xl"
        className={classes.area + " " + (isAll ? classes.all : classes.less)}
      >
        <Stack gap="md">
          <Title order={3}># Tags</Title>
          {tagGroup}
        </Stack>
        <Stack>
          <Group align="center" justify="center" className={classes.button}>
            <Button
              variant="default"
              onClick={() => {
                setIsAll(!isAll);
              }}
            >
              Show{isAll ? " Less" : " More"}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </MantineProvider>
  );
}

interface ITagGroupProps {
  tags: [name: string, url: string, count: number][];
}

export function TagGroup({ tags }: ITagGroupProps) {
  return (
    <MantineProvider>
      <Group gap="xs">
        {tags.map(([name, url]) => (
          <TagItem key={name} tag={name} url={url} />
        ))}
      </Group>
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
      <Badge key={tag} variant="light" size="lg" style={{ cursor: "pointer" }}>
        {tag}
      </Badge>
    </Anchor>
  );
}
