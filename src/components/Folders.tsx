import { Container, Flex, Stack, Group, Text, darken, Anchor, Card, Paper } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import Folder from "../bits/Components/Folder/Folder";
import { Heatmap } from "@mantine/charts";
import dayjs from "dayjs";
import { FILTER_ENTRY, POST_CARD_UNDERLINE_COLORS, TITLE_COLOR_MAP } from "@/packages/consts";
import classes from "./Folder.module.css"
import { File } from "lucide-react";
import { type IPost } from "./BlogList";
import { isString } from "es-toolkit";
import { useEffect, useState } from "react";
import LetterGlitch from "../bits/Backgrounds/LetterGlitch/LetterGlitch";

interface IYearProps {
    heatmap: Record<string, number>
    counts: Record<string, number>
    top3s: Map<string, IPost[]>
}

export default function Folders({ heatmap, counts, top3s }: IYearProps) {
    return (
        <CustomMantineProvider>
            <Container fluid style={{ marginInline: "initial" }}>
                <Flex wrap={"wrap"}>
                    {Object.keys(counts).filter(year => year !== FILTER_ENTRY.ALL).reverse().map(year => {
                        const color = darken(TITLE_COLOR_MAP[POST_CARD_UNDERLINE_COLORS[parseInt(year, 10) % POST_CARD_UNDERLINE_COLORS.length]], .3)
                        return (
                            <Group w={400} h={400} justify="center" key={year}>
                                {/* <Anchor href={"/year/" + year}> */}
                                    <Folder size={3}
                                        color={color}
                                        title={<PostCountLabel text={counts[year].toString()}/>}
                                        cover={<FolderCover year={year} heatmap={heatmap} />}
                                        items={top3s.get(year)?.map(post => <FileItem post={post}/>)}
                                    />
                                {/* </Anchor> */}
                            </Group>
                        )
                    })}
                </Flex>
            </Container>
        </CustomMantineProvider>
    )
}

function FileItem({ post }: { post: IPost }) {
    const [url, setUrl] = useState("")

    useEffect(() => {
        const coverUrl = isString(post.data.cover?.url) ? post.data.cover?.url : post.data.cover?.url.src
        if (!coverUrl) return
        const imgEl = new Image()
        imgEl.onload = () => setUrl(coverUrl)
        imgEl.src = coverUrl
    }, [post])

    return url ? <img src={url} />: null
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
            <Text c={"gray"}>{year}</Text>
            <Group display={"block"} style={{ overflow: "hidden", borderRadius: "var(--mantine-radius-sm)" }}>
                {[`${year}-01-01`, `${year}-07-01`].map(day => (<Heat key={day} data={heatmap} startDate={day} />))}
            </Group>
        </Stack>
    )
}