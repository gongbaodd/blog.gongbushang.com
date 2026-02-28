import { Anchor, Stack, Text, Title } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface IPodcastSidebarProps {
  title: string;
  description?: string;
  link?: string;
  image?: string;
}

export default function PodcastSidebar({
  title,
  description,
  link,
  image,
}: IPodcastSidebarProps) {
  return (
    <CustomMantineProvider>
      <Stack gap="sm">
        {image && (
          <Anchor href={link} target="_blank">
            <img
              src={image}
              alt={title}
              style={{
                width: "100%",
                maxWidth: 120,
                borderRadius: 8,
                objectFit: "cover",
              }}
            />
          </Anchor>
        )}
        <Title order={4}>{title}</Title>
        {description && (
          <Text size="xs" c="dimmed" lineClamp={4}>
            {description}
          </Text>
        )}
        {link && (
          <Anchor href={link} target="_blank" size="xs">
            Listen on Spotify
          </Anchor>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}
