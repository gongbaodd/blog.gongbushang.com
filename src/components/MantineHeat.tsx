import { Heatmap } from '@mantine/charts';
import CustomMantineProvider from '../stores/CustomMantineProvider';
import { Anchor, Button, Card, Flex, ScrollArea, Stack, Title } from '@mantine/core';
import dayjs from 'dayjs';

interface IHeat {
    data: Record<string, number>
    count: number
}

export default function MantineHeat({ data, count }: IHeat) {
    const startDate = dayjs().startOf("year").format("YYYY-MM-DD")
    const endDate = dayjs().endOf("year").format("YYYY-MM-DD")

    return (
        <CustomMantineProvider>
            <Card shadow="md" radius="lg" p="xl">
                <Flex direction={"row"} justify={"space-between"}>
                    <Stack justify="space-between">
                        <Title order={2} size="h2" fw={600}>
                            {count} posts in 2025
                        </Title>
                        <Anchor href="/all">
                            <Button size="md" variant="outline">View Them</Button>
                        </Anchor>
                    </Stack>
                    <ScrollArea.Autosize maw={1400}>
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
                            colors={[
                                'var(--mantine-color-blue-4)',
                                'var(--mantine-color-blue-6)',
                                'var(--mantine-color-blue-7)',
                                'var(--mantine-color-blue-9)',
                            ]}
                        />
                    </ScrollArea.Autosize>
                </Flex>
            </Card>
        </CustomMantineProvider>
    )
}