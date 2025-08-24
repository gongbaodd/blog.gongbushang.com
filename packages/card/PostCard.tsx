import ViewCount from "@/src/components/ViewCount";
import { Avatar, Flex, Card, Text, Anchor, Box, Badge, Group, Title } from "@mantine/core";
import { IconQuoteFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import type { TClientPost } from "../utils/post";
import classes from "./PostCard.module.css"

export interface IPost extends TClientPost {
}

interface ICardProp { post: IPost; hideExcerpt?: boolean }

export function PostCard({ post, hideExcerpt }: ICardProp) {
  const title = post.title;

  const className = [
    classes.item,
    post.data.cover ? classes.with_bg : classes[post.data.bgClass],
    classes[post.data.layout]
  ].join(" ")

  const [coverImage, setCoverImage] = useState("")

  useEffect(() => {
    setCoverImage(c => {
      const { cover } = post.data
      if (cover) {
        if (typeof cover.url === "string") {
          return cover.url
        }
        return cover.url.src
      }
      return c
    })

  }, [post])

  const [coverOpacity, setCoverOpacity] = useState(0)

  useEffect(() => {
    if (!coverImage) return

    const img = new Image()
    img.src = coverImage
    img.onload = () => setCoverOpacity(1)
  }, [coverImage])

  const { tracedCover } = {
    get tracedCover() {
      const { trace } = post.data
      const encoded = encodeURIComponent(trace);
      const cssBg = `url("data:image/svg+xml,${encoded}")`;
      return cssBg
    }
  }

  return (
    <Box>
      <Anchor underline="never" href={post.href}>
        <Card
          key={post.id}
          shadow="sm"
          padding="lg"
          radius="lg"
          withBorder
          className={className}
          style={{
            backgroundColor: post.data.bgColor,
            "--underline-color": `var(${post.data.titleColor})`,
            "--cover-opacity": coverOpacity,
            "--cover-image": `url(${coverImage})`,
            "--cover-trace": tracedCover
          }}
        >
          <Flex direction={"column"} justify={"space-between"} flex={1} className={classes.content}>
            <Flex justify={"space-between"} align={"center"}>
              <Badge
                color="gray"
                variant="default"
                size="sm"
                className={classes.category}
              >
                <Group gap={6}>
                  <Calendar size={12} />
                  <Text size="xs">{dayjs(post.date).format("YYYY-MM-DD")}</Text>
                </Group>
              </Badge>
              <Avatar
                color="gray"
                variant="default"
                size="sm"
                className={classes.category}
                p={0}
              >
                <ViewCount path={post.href} />
              </Avatar>
            </Flex>


            <Title className={classes.title}>
              <span>{title}</span>
            </Title>

            <Flex gap="xs" justify={"space-between"} align={"end"}>
              <Group flex={1}>
                <Badge
                  color="gray"
                  variant="default"
                  size="sm"
                  className={classes.category}
                >
                  {post.data.category}
                </Badge>
              </Group>

              <Group gap="xs" flex={0} miw="5em">
                {post.data.series && (
                  <Badge 
                    key={post.data.series.slug}
                    color="gray"
                    variant="default"
                    size="xs"
                    className={classes.category}
                  >
                    {post.data.series.name ?? post.data.series.slug}
                  </Badge>
                )}

                { post.data.tag?.map((tag: string) => (
                  <Badge
                    key={tag}
                    color="gray"
                    variant="default"
                    size="xs"
                    className={classes.category}
                  >
                    #{tag}
                  </Badge>
                ))}
              </Group>
            </Flex>
          </Flex>
        </Card>
      </Anchor>
      {!hideExcerpt && (
        <Flex pl={5} pr={10} pt={5}>
          <Avatar
            size="xs"
            variant="transparent"
            style={{ transform: "rotateZ(180deg)" }}
          >
            <IconQuoteFilled />
          </Avatar>
          <Text size="sm" lineClamp={2} className={classes.excerpt}>
            {post.excerpt}
          </Text>
        </Flex>
      )}
    </Box>
  );
}
