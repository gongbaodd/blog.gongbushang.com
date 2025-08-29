import { Card, Flex, Skeleton, Stack } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function ArchiveSkeleton() {
    return <CustomMantineProvider>
        <Card w={240} h={140} shadow="xl" radius={"md"} p={"md"}>

            <Stack gap={"xs"}>
                <Skeleton height={40} w={"100%"} />
                <Flex direction={"column"} h={60} align="flex-start" gap={"xs"} wrap={"wrap"}>
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                </Flex>
            </Stack>
        </Card>
    </CustomMantineProvider>
}