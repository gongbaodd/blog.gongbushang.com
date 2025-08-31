import { Heatmap } from '@mantine/charts';
import CustomMantineProvider from '@/src/stores/CustomMantineProvider';
import { Anchor, Button, Flex, Stack, Title } from '@mantine/core';
import dayjs from 'dayjs';
import { useStore } from '@nanostores/react';
import { $countsMap, $currentYear, $heatmap, requestHeatData } from './store/heatmap';
import { useEffect } from 'react';

interface IHeat {}

export default function MantineHeat({}: IHeat) {
    const data = useStore($heatmap)
    const countsMap = useStore($countsMap)
    const currentYear = useStore($currentYear)
    const count = countsMap[currentYear] ?? 0

    const startDate = dayjs(currentYear).startOf("year").format("YYYY-MM-DD")
    const endDate = dayjs(currentYear).endOf("year").format("YYYY-MM-DD")

    useEffect(() => {
        requestHeatData()
    }, [])

    return (
        <CustomMantineProvider>
            <Flex direction={"row"} justify="space-evenly" wrap={"wrap"} gap={"lg"} px={"xl"}>
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