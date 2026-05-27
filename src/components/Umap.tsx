import { ScatterChart, type ScatterChartProps } from "@mantine/charts";
import { Anchor, Card, Center, Loader, Paper, Stack, Text } from "@mantine/core";
import { useStore } from "@nanostores/react";
import dayjs from "dayjs";
import { useEffect } from "react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import {
  $umapChartData,
  $umapError,
  $umapLoading,
  $umapPosts,
  requestUmapData,
  type IUmapChartPoint,
} from "@/src/stores/umap";

interface IUmapTooltipProps {
  payload?: readonly { payload?: IUmapChartPoint }[];
}

export function UmapTooltip({ payload }: IUmapTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!point) return null;

  return (
    <Paper px="md" py="sm" withBorder shadow="md">
      <Stack gap={4}>
        <Anchor href={point.href} size="sm" fw={500}>
          {point.title}
        </Anchor>
        <Text size="xs" c="dimmed">
          {dayjs(point.date).format("YYYY-MM-DD")}
        </Text>
        <Text size="xs" c="dimmed">
          {point.category}
        </Text>
      </Stack>
    </Paper>
  );
}

export default function Umap() {
  const chartData = useStore($umapChartData);
  const loading = useStore($umapLoading);
  const error = useStore($umapError);
  const posts = useStore($umapPosts);

  useEffect(() => {
    requestUmapData();
  }, []);

  return (
    <CustomMantineProvider>
      <Card padding="lg">
        {loading ? (
          <Center h={500}>
            <Loader data-testid="umap-loader" />
          </Center>
        ) : error ? (
          <Center h={500}>
            <Text c="red">{error}</Text>
          </Center>
        ) : posts.length === 0 ? (
          <Center h={500}>
            <Text c="dimmed">No posts with UMAP coordinates yet.</Text>
          </Center>
        ) : (
          <ScatterChart
            h={500}
            data={chartData as ScatterChartProps["data"]}
            dataKey={{ x: "x", y: "y" }}
            xAxisLabel="UMAP 1"
            yAxisLabel="UMAP 2"
            withLegend
            legendProps={{ verticalAlign: "bottom" }}
            withTooltip
            valueFormatter={(value) => value.toFixed(3)}
            scatterProps={{ r: 3 }}
            tooltipProps={{
              content: ({ payload }) => <UmapTooltip payload={payload} />,
            }}
          />
        )}
      </Card>
    </CustomMantineProvider>
  );
}
