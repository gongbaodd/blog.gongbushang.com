import { useMemo } from "react";
import { Box, Slider } from "@mantine/core";
import classes from "../ParticleHero.module.css";

interface ILegendYearSliderProps {
  years: string[];
  yearIndex: number;
  onYearChange: (value: number) => void;
}

export default function LegendYearSlider({
  years,
  yearIndex,
  onYearChange,
}: ILegendYearSliderProps) {
  const marks = useMemo(
    () =>
      years.map((year, index) => ({
        value: index,
        label: index === years.length - 1 ? "current" : year,
      })),
    [years],
  );

  return (
    <Box className={classes.legendYear} aria-label="Filter by year" p="lg">
      <Slider
        classNames={{ markLabel: classes.legendYearMarkLabel }}
        min={0}
        max={Math.max(0, years.length - 1)}
        step={1}
        value={yearIndex}
        onChange={onYearChange}
        label={null}
        marks={marks}
        size="sm"
        color="var(--mantine-color-dark-2)"
      />
    </Box>
  );
}
