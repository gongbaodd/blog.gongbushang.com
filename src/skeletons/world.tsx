import { Card, Flex, Skeleton, Stack } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function WorldSkeleton() {
    return <CustomMantineProvider>
        <Card w={240} h={140} visibleFrom="md">
            <Flex gap={"xs"} justify={"space-evenly"}>
                <Skeleton height={50} w={15} />
                <Stack gap={"xs"}>
                    <Skeleton height={40} w={"100%"} />
                    <Flex direction={"column"} h={60} align="flex-start" gap={"xs"} wrap={"wrap"}>
                        <Skeleton height={30} w={20} />
                        <Skeleton height={40} w={20} />
                        <Skeleton height={20} w={20} />
                        <Skeleton height={30} w={20} />
                        <Skeleton height={40} w={20} />
                        <Skeleton height={40} w={20} />
                        <Skeleton height={20} w={20} />
                        <Skeleton height={20} w={20} />
                    </Flex>
                </Stack>
            </Flex>
        </Card>

        <Card w={100} h={140} shadow="xl" radius={"md"} p={"md"} hiddenFrom="md">
            <Stack align="center">
                <Skeleton height={40} w={"100%"} animate={false} />
                <Skeleton height={30} w={40} animate={false} />
                <Skeleton height={40} w={40} animate={false} />
                <Skeleton height={20} w={40} animate={false} />
                <Skeleton height={30} w={40} animate={false} />
            </Stack>
        </Card>
    </CustomMantineProvider>
}