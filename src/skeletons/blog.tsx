import { Card, Flex, Skeleton } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function BlogSkeleton() {
    return <CustomMantineProvider>
        <Card w={240} h={140} shadow="xl" radius={"md"} p={"md"}>
            <Flex gap={"xs"} justify={"space-evenly"}>
                <Skeleton height={50} w={15} />
                <Flex direction={"column"} h={100} align="flex-start" gap={"xs"} wrap={"wrap"}>
                    <Skeleton height={30} w={20} />
                    <Skeleton height={40} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={30} w={20} />
                    <Skeleton height={40} w={20} />
                    <Skeleton height={40} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={30} w={20} />
                    <Skeleton height={40} w={20} />
                    <Skeleton height={20} w={20} />
                    <Skeleton height={30} w={20} />
                    <Skeleton height={20} w={20} />
                </Flex>
            </Flex>
        </Card>
    </CustomMantineProvider>
}