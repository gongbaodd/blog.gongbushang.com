import { useMemo, useState } from "react";
import {
  getCategoryColor,
  getFilterOptions,
  type PostFilterState,
  type UmapPost,
} from "../postsData";
import classes from "../ParticleHero.module.css";

interface ILegendFilterProps {
  posts: UmapPost[];
  onChange: (state: PostFilterState) => void;
}

export default function LegendFilter({ posts, onChange }: ILegendFilterProps) {
  const { categories, years } = useMemo(
    () => getFilterOptions(posts),
    [posts],
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [yearIndex, setYearIndex] = useState(() => Math.max(0, years.length - 1));

  const selectedYear = years[yearIndex] ?? years[years.length - 1] ?? "";
  const lastYear = years[years.length - 1] ?? "";

  function emitChange(category: string, year: string) {
    onChange({ category, year });
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    emitChange(category, selectedYear);
  }

  function onYearInput(value: number) {
    setYearIndex(value);
    const year = years[value] ?? lastYear;
    emitChange(selectedCategory, year);
  }

  const yearLabel =
    selectedYear === lastYear ? "All" : `≤ ${selectedYear}`;

  if (!years.length) return null;

  return (
    <div
      className={classes.legendFilter}
      aria-label="Category and year filter"
    >
      <div className={classes.legendCategories}>
        <button
          type="button"
          className={
            classes.legendChip +
            (selectedCategory === "all" ? " " + classes.legendChipActive : "")
          }
          onClick={() => selectCategory("all")}
        >
          <span
            className={
              classes.legendSwatch + " " + classes.legendSwatchAll
            }
          />
          <span>All</span>
        </button>
        {categories.map((category) => {
          const color = getCategoryColor(category);
          return (
            <button
              key={category}
              type="button"
              className={
                classes.legendChip +
                (selectedCategory === category
                  ? " " + classes.legendChipActive
                  : "")
              }
              onClick={() => selectCategory(category)}
            >
              <span
                className={classes.legendSwatch}
                style={{ background: color }}
              />
              <span>{category.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
      <div className={classes.legendYears}>
        <div className={classes.legendYearLabel}>{yearLabel}</div>
        <div className={classes.legendSliderRow}>
          <span className={classes.legendYearBound}>{years[0]}</span>
          <input
            type="range"
            className={classes.legendYearSlider}
            min={0}
            max={years.length - 1}
            step={1}
            value={yearIndex}
            aria-label="Filter by year"
            onChange={(e) => onYearInput(Number(e.target.value))}
          />
          <span className={classes.legendYearBound}>{lastYear}</span>
        </div>
      </div>
    </div>
  );
}
