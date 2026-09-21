import { useMemo, useState } from "react";
import {
  getFilterOptions,
  type PostFilterState,
  type UmapPost,
} from "./postsData";

export function usePostFilter(
  posts: UmapPost[],
  onChange: (state: PostFilterState) => void,
) {
  const { categories, years } = useMemo(
    () => getFilterOptions(posts),
    [posts],
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [yearIndex, setYearIndex] = useState(() =>
    Math.max(0, years.length - 1),
  );
  const [yearTouched, setYearTouched] = useState(false);

  // Posts may arrive asynchronously (island props are kept small), so until
  // the user picks a year keep following the latest known year.
  const effectiveYearIndex = yearTouched
    ? Math.min(yearIndex, Math.max(0, years.length - 1))
    : Math.max(0, years.length - 1);

  const selectedYear = years[effectiveYearIndex] ?? years[years.length - 1] ?? "";
  const lastYear = years[years.length - 1] ?? "";
  const hasYears = years.length > 0;

  function emitChange(category: string, year: string) {
    onChange({ category, year });
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    emitChange(category, selectedYear);
  }

  function onYearChange(value: number) {
    setYearTouched(true);
    setYearIndex(value);
    const year = years[value] ?? lastYear;
    emitChange(selectedCategory, year);
  }

  return {
    categories,
    years,
    selectedCategory,
    yearIndex: effectiveYearIndex,
    lastYear,
    hasYears,
    selectCategory,
    onYearChange,
  };
}
