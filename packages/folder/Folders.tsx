import { Container, Flex, Stack, Group, Text, darken, Anchor, Card, Paper, Button, Center } from "@mantine/core";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import Folder from "@/src/bits/Components/Folder/Folder";
import { Heatmap } from "@mantine/charts";
import dayjs from "dayjs";
import { FILTER_ENTRY, POST_CARD_UNDERLINE_COLORS, TITLE_COLOR_MAP } from "@/packages/consts";
import classes from "./Folder.module.css"
import { File } from "lucide-react";
import { isString } from "es-toolkit";
import { useEffect, useState } from "react";
import type { IPost } from "@/packages/card/PostCard";

interface IYearProps {
    heatmap: Record<string, number>
    counts: Record<string, number>
    top3s: Record<string, (IPost|undefined)[]>
    colors: Record<string, string>
}

export default function Folders({ heatmap, counts, top3s, colors }: IYearProps) {
    const [openedYear, setOpenedYear] = useState<null | string>(null)

    return (
        <CustomMantineProvider>
            <Container fluid style={{ marginInline: "initial" }} p={0} mih={"50vh"}>
                <Flex wrap={"wrap"} className={classes.grid}>
                    {Object.keys(counts).filter(year => year !== FILTER_ENTRY.ALL).reverse().map(year => {
                        const color = colors[year]
                        const top3 = top3s[year] 

                        return (
                            <Group className={classes.folder} key={year}>
                                <Folder size={3}
                                    color={color}
                                    title={<PostCountLabel text={counts[year].toString()} />}
                                    cover={<FolderCover year={year} heatmap={heatmap} />}
                                    items={top3?.map(post => post && <FileItem post={post} />)}
                                    setOpen={open => {
                                        if (open) {
                                            setOpenedYear(year)
                                        } else {
                                            setOpenedYear(null)
                                        }}
                                    }
                                    open={openedYear === year}
                                />
                                {openedYear === year && (
                                    <Center style={{ position: "absolute" }}>
                                        <Anchor href={"/year/" + year}>
                                            <Button radius={"md"} size="xl" variant="gradient">View {counts[year].toString()} posts</Button>
                                        </Anchor>
                                    </Center>
                                )}
                            </Group>
                        )
                    })}
                </Flex>
            </Container>
        </CustomMantineProvider>
    )
}

function FileItem({ post }: { post: IPost}) {
    const [url, setUrl] = useState("")

    useEffect(() => {
        const coverUrl = isString(post.data.cover?.url) ? post.data.cover?.url : post.data.cover?.url.src
        if (!coverUrl) return
        const imgEl = new Image()
        imgEl.onload = () => setUrl(coverUrl)
        imgEl.src = coverUrl
    }, [post])

    return url ? <Group w={"100%"} h={"100%"} style={{
        position: "absolute",
        backgroundImage: `url(${url})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
    }}>
    </Group> : null
}

interface IHeat {
    data: IYearProps["heatmap"]
    startDate: string
}

function Heat({ data, startDate: _startDate }: IHeat) {
    const startDate = dayjs(_startDate).startOf("week").format("YYYY-MM-DD")
    const endDate = dayjs(startDate).add(26, "week").format("YYYY-MM-DD")
    return (
        <Heatmap
            startDate={startDate}
            endDate={endDate}
            data={data}
            rectSize={2.5}
            rectRadius={2.5}
            gap={1}
            colors={[
                'var(--mantine-color-gray-4)',
                'var(--mantine-color-gray-6)',
                'var(--mantine-color-gray-7)',
                'var(--mantine-color-gray-9)',
            ]}
        />
    )
}

function PostCountLabel({text}: {text: string}) {
    return (
        <Flex c="gray" align={"center"} style={{ transform: "scale(.85)" }}>
            <File size={12} />
            <Text size="xs" >{text}</Text>
        </Flex>
    )
}

function FolderCover({ year, heatmap }: { year: string, heatmap: IYearProps["heatmap"] }) {
    return (
        <Stack gap={0}
            className={classes.cover}
            justify="center"
            align="center"
        >
            <Text c={"white"}>{year}</Text>
            <Group display={"block"} style={{ overflow: "hidden", borderRadius: "var(--mantine-radius-sm)" }}>
                {[`${year}-01-01`, `${year}-07-01`].map(day => (<Heat key={day} data={heatmap} startDate={day} />))}
            </Group>
        </Stack>
    )
}