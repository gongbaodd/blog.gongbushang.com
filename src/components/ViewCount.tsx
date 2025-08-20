
import { useStore } from "@nanostores/react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { Group, Flex, Text } from "@mantine/core";
import { $pvMap, $pvText, requestAllViewCount } from "../stores/pv";
import { useEffect, useState } from "react";
import classes from "./ViewCount.module.css"
import { Eye } from "lucide-react";

interface IViewCountProps {
    path: string
}

export default function ViewCount({ path }: IViewCountProps) {
    const [count, setCount] = useState("")

    useEffect(() => {
        solveHydrationProblem()

        async function solveHydrationProblem() {
            // multiple islands may cause hydration problem
            await requestAllViewCount()
            const pvMap = $pvMap.get()
            setCount(pvMap[path].toString() ?? "")
        }
    }, [path])

    return (
        <CustomMantineProvider>
            <Group style={{ position: "relative" }}>
                <Flex style={{ position: "absolute", width: "100%", height: "100%" }} justify={"center"} align={"center"}>
                    <Text size="xs" className={classes.count}>{count}</Text>
                </Flex>
                {count ? <EmptyEye /> : <Eye />}
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