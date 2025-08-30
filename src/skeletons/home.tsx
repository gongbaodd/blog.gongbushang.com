import { Card, Center, Flex, Skeleton, Stack } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function HomeSkeleton() {
    return <CustomMantineProvider>
        <Card w={240} h={140} visibleFrom="md">
            <Flex justify={"center"} align="center" gap={"md"} mb={"md"}>
                <Skeleton height={50} w={50} />
                <Stack align="flex-start" gap={"xs"}>
                    <Skeleton height={8} w={80} radius="xl" />
                    <Skeleton height={8} w={80} radius="xl" />
                    <Skeleton height={8} w={50} width="70%" radius="xl" />
                </Stack>
            </Flex>
            <Skeleton height={8} radius="xl" />
            <Skeleton height={8} mt={6} radius="xl" />
            <Skeleton height={8} mt={6} width="70%" radius="xl" />
        </Card>

        <Card w={100} h={140} shadow="xl" radius={"md"} p={"md"} hiddenFrom="md">
            <Center>
                <Skeleton height={50} w={50} animate={false} />
            </Center>
            <Skeleton height={8} mt={6} radius="xl" animate={false} />
            <Skeleton height={8} mt={6} radius="xl" animate={false} />
            <Skeleton height={8} mt={6} width="70%" radius="xl" animate={false} />
        </Card>
    </CustomMantineProvider>
}