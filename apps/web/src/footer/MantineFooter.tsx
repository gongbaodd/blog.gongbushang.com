import {
  ActionIcon,
  Anchor,
  Avatar,
  Box,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Typography,
} from "@mantine/core";
import type { ReactNode } from "react";
import { Mail } from "lucide-react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import classes from "./Footer.module.css";
import { SOCIAL_ICONS } from "./social-icons";
import type { SocialLink } from "../lib/social-links";

interface IFooterProps {
  children?: ReactNode;
  socials?: SocialLink[];
  picture?: ReactNode;
  viewCount?: ReactNode;
  openSource?: ReactNode;
}

export default function MantineFooter({
  socials = [],
  viewCount,
  openSource,
}: IFooterProps) {
  return (
    <CustomMantineProvider>
      <Box
        component="footer"
        mt="xl"
        pt="xl"
        style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}
        id="socials"
      >
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg" mb="xl">
            <Stack gap="md">
              <Text fw={600} size="lg">
                About
              </Text>
              <Stack gap="xs">
                <Anchor href="/about" size="sm" c="dimmed" td="none">
                  About me
                </Anchor>
                <Anchor href="/contact" size="sm" c="dimmed" td="none">
                  Contact
                </Anchor>
                <Anchor href="/resume" size="sm" c="dimmed" td="none">
                  Resume
                </Anchor>
                <Anchor href="/lab" size="sm" c="dimmed" td="none">
                  Portfolio
                </Anchor>
              </Stack>
            </Stack>

            <Stack gap="md">
              <Text fw={600} size="lg">
                Categories
              </Text>
              <Stack gap="xs">
                <Anchor href="/fe" size="sm" c="dimmed" td="none">
                  Web
                </Anchor>
                <Anchor href="/world" size="sm" c="dimmed" td="none">
                  Travel
                </Anchor>
                <Anchor href="/plan" size="sm" c="dimmed" td="none">
                  Todos
                </Anchor>
                <Anchor href="/lab" size="sm" c="dimmed" td="none">
                  Lab
                </Anchor>
              </Stack>
            </Stack>

            <Stack gap="md">
              <Text fw={600} size="lg">
                Resources
              </Text>
              <Stack gap="xs">
                <Anchor href="/rss.xml" size="sm" c="dimmed" td="none">
                  RSS
                </Anchor>
                <Anchor href="/sitemap" size="sm" c="dimmed" td="none">
                  Sitemap
                </Anchor>
                <Anchor href="/year" size="sm" c="dimmed" td="none">
                  Archive
                </Anchor>
                <Anchor href="/tags" size="sm" c="dimmed" td="none">
                  Tags
                </Anchor>
              </Stack>
            </Stack>

            <Stack gap="md">
              <Text fw={600} size="lg">
                Follow me in social media
              </Text>
              <Group gap="md">
                {socials.map((link) => {
                  const svg = SOCIAL_ICONS[link.icon];
                  const icon =
                    link.icon === "mail" ? (
                      <Mail size={24} />
                    ) : svg ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        stroke="none"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="currentcolor"
                        aria-hidden="true"
                        className="lucide"
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    ) : null;
                  return icon ? (
                    <ActionIcon
                      key={link.url}
                      variant="subtle"
                      size="lg"
                      component="a"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={link.label}
                    >
                      {icon}
                    </ActionIcon>
                  ) : (
                    <Anchor
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="sm"
                      c="dimmed"
                    >
                      {link.label}
                    </Anchor>
                  );
                })}
              </Group>
              {/* <Text size="sm" c="dimmed">
                订阅我的博客，获取最新技术文章和编程技巧
              </Text> */}
            </Stack>
          </SimpleGrid>

          <Divider mb="md" />

          <Group justify="space-between" align="center" py="md">
            <Group align="center" gap="xs">
              {viewCount}
              <Text size="sm" c="dimmed">
                © 2026 All rights reserved..
              </Text>
            </Group>

            <Group gap="md">
              <Anchor href="/privacy#ad-preferences" size="sm" c="dimmed" td="none">
                Privacy &amp; ad settings
              </Anchor>
            </Group>
          </Group>

          <Typography
            className={classes.opensource}
            ta="center"
            c="dimmed"
            py="sm"
            style={{ fontSize: "var(--mantine-font-size-xs)" }}
          >
            {openSource}
          </Typography>
        </Container>
      </Box>
    </CustomMantineProvider>
  );
}
