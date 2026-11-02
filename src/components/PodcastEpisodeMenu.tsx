import { Anchor, Button, Card, Stack, Text, Title } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

interface IPodcastEpisodeMenuProps {
  title: string;
  description?: string;
  link?: string;
  image?: string;
}

export default function PodcastEpisodeMenu({
  title,
  description,
  link,
  image,
}: IPodcastEpisodeMenuProps) {
  return (
    <CustomMantineProvider>
      <Stack
        gap="xl"
        maw={300}
        mx={{ base: "auto", lg: 0 }}
        style={{ position: "sticky", top: 100 }}
      >
        <Card shadow="md" radius="lg" p="lg">
          <Stack gap="sm" align="center">
            {image && (
              <Anchor href={link} target="_blank" rel="noopener noreferrer">
                <img
                  src={image}
                  alt={title}
                  style={{
                    width: "100%",
                    maxWidth: 160,
                    borderRadius: 12,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </Anchor>
            )}
            <Title order={4} ta="center">
              {title}
            </Title>
          </Stack>
        </Card>
        {description && (
          <Card shadow="md" radius="lg" p="lg" visibleFrom="lg">
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          </Card>
        )}
        <Button
          component="a"
          href="/podcast"
          radius="lg"
          variant="default"
          fullWidth
        >
          All episodes
        </Button>
      </Stack>
    </CustomMantineProvider>
  );
}
