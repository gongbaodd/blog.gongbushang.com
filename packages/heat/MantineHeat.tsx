import { Heatmap } from '@mantine/charts';
import CustomMantineProvider from '@/src/stores/CustomMantineProvider';
import { Anchor, Button, Flex, ScrollArea, Stack, Title } from '@mantine/core';
import dayjs from 'dayjs';
import { Box } from 'lucide-react';

interface IHeat {
    data: Record<string, number>
    count: number
}

export default function MantineHeat({ data, count }: IHeat) {
    const startDate = dayjs().startOf("year").format("YYYY-MM-DD")
    const endDate = dayjs().endOf("year").format("YYYY-MM-DD")

    return (
        <CustomMantineProvider>
            <Flex direction={"row"} justify="space-between" wrap={"wrap"} gap={"lg"} px={"xl"}>
                <Heatmap
                    rectSize={20}
                    rectRadius={20}
                    gap={4}
                    data={data}
                    startDate={startDate}
                    endDate={endDate}
                    withTooltip
                    withWeekdayLabels
                    withMonthLabels
                    withOutsideDates={false}
                    maw={1200}
                    colors={[
                        'var(--mantine-color-blue-4)',
                        'var(--mantine-color-blue-6)',
                        'var(--mantine-color-blue-7)',
                        'var(--mantine-color-blue-9)',
                    ]}
                    ref={svg => {
                        svg?.setAttribute("viewBox", `0 0 1306 186`)
                    }}
                />


                <Flex justify="center" hiddenFrom='xl' w="100%">
                    <Anchor href="/year/2025">
                        <Button size="md" variant="outline">View {count} posts in 2025</Button>
                    </Anchor>
                </Flex>

                
                <Stack justify="space-around" visibleFrom='xl'>
                    <Title order={2} size="h2" fw={600}>
                        {count} posts in 2025
                    </Title>
                    <Anchor href="/year/2025">
                        <Button size="md" variant="outline">View Them</Button>
                    </Anchor>
                </Stack>
            </Flex>
        </CustomMantineProvider>
    )
}