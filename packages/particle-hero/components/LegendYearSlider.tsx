import { Box, Group, Slider, Stack, Text } from "@mantine/core";
import classes from "../ParticleHero.module.css";

interface ILegendYearSliderProps {
  years: string[];
  yearIndex: number;
  yearLabel: string;
  lastYear: string;
  onYearChange: (value: number) => void;
}

export default function LegendYearSlider({
  years,
  yearIndex,
  yearLabel,
  lastYear,
  onYearChange,
}: ILegendYearSliderProps) {
  const firstYear = years[0] ?? "";

  return (
    <Stack
      className={classes.legendYear}
      gap="xs"
      aria-label="Filter by year"
    >
      <Text size="sm" fw={600}>
        {yearLabel}
      </Text>
      <Group gap="sm" wrap="nowrap" align="center">
        <Text size="xs" c="dimmed" className={classes.legendYearBound}>
          {firstYear}
        </Text>
        <Box className={classes.legendYearSlider}>
          <Slider
            min={0}
            max={Math.max(0, years.length - 1)}
            step={1}
            value={yearIndex}
            onChange={onYearChange}
            label={null}
            size="sm"
          />
        </Box>
        <Text size="xs" c="dimmed" className={classes.legendYearBound}>
          {lastYear}
        </Text>
      </Group>
    </Stack>
  );
}
