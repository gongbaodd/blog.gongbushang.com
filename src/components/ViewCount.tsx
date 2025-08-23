
import { useStore } from "@nanostores/react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Group, Flex, Text } from "@mantine/core";
import { $pvMap, requestAllViewCount } from "../stores/pv";
import { useEffect } from "react";
import classes from "./ViewCount.module.css"
import { Eye } from "lucide-react";
import { computed } from "nanostores";

interface IViewCountProps {
    path: string
}

export default function ViewCount({ path: _path }: IViewCountProps) {
    const path = normalizePath(_path)
    const $count = computed($pvMap, v => v[path])
    const count = useStore($count)

    useEffect(() => {
        requestAllViewCount()
    }, [])

    return (
        <CustomMantineProvider>
            <Skeleton count={count} />
        </CustomMantineProvider>
    )
}

function normalizePath(path: string) {
  return path.endsWith('/') && path !== '/' 
    ? path.slice(0, -1) 
    : path;
}

function Skeleton({ count }: { count: number }) {
    return (
        <CustomMantineProvider>
            <Group style={{ position: "relative" }}>
                <Flex style={{ position: "absolute", width: "100%", height: "100%" }} justify={"center"} align={"center"}>
                    <Text size="xs" className={classes.count}>{count}</Text>
                </Flex>
                {count ? <EmptyEye /> : <Eye strokeWidth={1} />}
            </Group>
        </CustomMantineProvider>
    )
}

function EmptyEye() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-eye-icon lucide-eye">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        </svg>
    )
}