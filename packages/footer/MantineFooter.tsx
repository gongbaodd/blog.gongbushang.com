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
import CustomMantineProvider from "../../src/stores/CustomMantineProvider";
import classes from "./Footer.module.css"

interface IFooterProps {
  children?: ReactNode;
  iconGithub?: ReactNode;
  iconTwitter?: ReactNode;
  iconInstagram?: ReactNode;
  iconLinkedin?: ReactNode;
  iconItchio?: ReactNode;
  iconThreads?: ReactNode;
  iconSpotify?: ReactNode;
  iconJike?: ReactNode;
  iconXiaohongshu?: ReactNode;
  iconYoutube?: ReactNode;
  iconFacebook?: ReactNode;
  iconBilibili?: ReactNode;
  iconV2ex?: ReactNode;
  picture?: ReactNode;
  viewCount?: ReactNode;
  openSource?: ReactNode;
}

export default function MantineFooter({
  iconGithub,
  iconTwitter,
  iconInstagram,
  iconLinkedin,
  iconItchio,
  iconSpotify,
  iconYoutube,
  iconThreads,
  iconJike,
  iconXiaohongshu,
  iconFacebook,
  iconBilibili,
  iconV2ex,
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
                <Anchor href="#socials" size="sm" c="dimmed" td="none">
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
                <Anchor href="/rss" size="sm" c="dimmed" td="none">
                  RSS
                </Anchor>
                <Anchor href="#sitemap" size="sm" c="dimmed" td="none">
                  Sitemap
                </Anchor>
                <Anchor href="/archive" size="sm" c="dimmed" td="none">
                  Archive
                </Anchor>
                <Anchor href="#tags" size="sm" c="dimmed" td="none">
                  Tags
                </Anchor>
              </Stack>
            </Stack>

            <Stack gap="md">
              <Text fw={600} size="lg">
                Follow me in social media
              </Text>
              <Group gap="md">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="mailto:gongbaodd@outlook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Mail"
                >
                  <Mail size={24} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://github.com/gongbaodd"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                >
                  {iconGithub}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://twitter.com/gongbaodd"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter"
                >
                  {iconTwitter}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.instagram.com/mia_takeshi"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                >
                  {iconInstagram}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.facebook.com/gongbaodd"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                >
                  {iconFacebook}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.linkedin.com/in/jian-gong-27762aa8/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                >
                  {iconLinkedin}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://gongbaodd.itch.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Itch.io"
                >
                  {iconItchio}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.threads.com/@mia_takeshi"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Threads"
                >
                  {iconThreads}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://open.spotify.com/show/2FJoLvI0tAnjXO3t71Iswz"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Spotify"
                >
                  {iconSpotify}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.youtube.com/@gongbaodd"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Youtube"
                >
                  {iconYoutube}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://m.okjike.com/users/a03ab857-dd35-44d3-8373-97e7a855db39?ref=PROFILE_CARD&utm_source=user_card"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Jike"
                >
                  {iconJike}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.xiaohongshu.com/user/profile/5b9aeeb2bc5acf0001cd8205?xsec_token=YB4pIrXwKkwZGhzRaHexYmAG4DbiA36rNSxHVtHOtJ3zY=&xsec_source=app_share&xhsshare=CopyLink&appuid=5b9aeeb2bc5acf0001cd8205&apptime=1754485791&share_id=c2a983d5fab04381a84f0851f936f880"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="小红书"
                >
                  {iconXiaohongshu}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://space.bilibili.com/3368538"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Bilibili"
                >
                  {iconBilibili}
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  component="a"
                  href="https://www.v2ex.com/member/gongbaodd"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="v2ex"
                >
                  {iconV2ex}
                </ActionIcon>
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
                © 2025 All rights reserved..
              </Text>
            </Group>

            <Group gap="md" visibleFrom="sm">
              <Anchor href="#cookies" size="sm" c="dimmed" td="none">
                About Cookie
              </Anchor>
            </Group>
          </Group>

          <Typography className={classes.opensource} ta="center" c="dimmed" py="sm" style={{ fontSize: "var(--mantine-font-size-xs)"}} >
            {openSource}
          </Typography>
        </Container>
      </Box>
    </CustomMantineProvider>
  );
}
