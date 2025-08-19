
import { useStore } from "@nanostores/react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Group, Flex, Text } from "@mantine/core";
import { $pvText, requestViewCount } from "../stores/pv";
import { useEffect } from "react";
import classes from "./ViewCount.module.css"

interface IViewCountProps {
    slug: string
}

export default function ViewCount({ slug: _slug }: IViewCountProps) {
    const pvMap = useStore($pvText)
    const slug = _slug.replaceAll("/", "-")

    useEffect(() => {
        requestViewCount(slug)
    }, [])

    return (
        <CustomMantineProvider>
            <Group style={{ position: "relative" }}>
                <Flex style={{ position: "absolute", width: "100%", height: "100%" }} justify={"center"} align={"center"}>
                    <Text size="xs" className={classes.count}>{pvMap[slug] ?? 0}</Text>
                </Flex>
                <Eye />
            </Group>
        </CustomMantineProvider>
    )
}

function Eye() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye-icon lucide-eye">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        </svg>
    )
}