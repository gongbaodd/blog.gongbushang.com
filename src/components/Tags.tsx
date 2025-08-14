import {
  Anchor,
  Badge,
  Button,
  Group,
  MantineProvider,
  Spoiler,
  Stack,
  Title,
} from "@mantine/core";
import classes from "./Tags.module.css";
import {
  useRef,
  useState,
  type ReactNode,
} from "react";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface ITagsProps {
  tagGroup?: ReactNode;
}

export default function Tags({ tagGroup }: ITagsProps) {
  const [expanded, setExpanded] = useState(false)

  const ToggleButton = () => {
    return (
      <Stack>
        <Group align="center" justify="center" className={classes.button}>
          <Button variant="default" onClick={() => setExpanded(!expanded)}>
            Show{expanded ? " Less" : " More"}
          </Button>
        </Group>
      </Stack>
    )
  }

  return (
    <CustomMantineProvider>
      <Stack
        gap="xl"
         className={classes.area + " " + (expanded ? classes.all : classes.less)}
      >
        <Stack gap="md">
          <Title order={3}># Topics</Title>
          <Spoiler
            showLabel={""}
            hideLabel={""}
            expanded={expanded}
          >
            {tagGroup}
          </Spoiler>
          <ToggleButton />
        </Stack>
      </Stack>
    </CustomMantineProvider>
  );
}

interface ITagGroupProps {
  tags: { label: string; href: string; count: number }[];
}

export function TagGroup({ tags }: ITagGroupProps) {
  return (
    <MantineProvider>
      <Group gap="xs">
        {tags.map(({ label, href }) => (
          <TagItem key={label} tag={label} url={href} />
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
      <Badge key={tag} variant="light" size="lg" style={{ cursor: "pointer", textTransform: "none" }}>
        {tag}
      </Badge>
    </Anchor>
  );
}
