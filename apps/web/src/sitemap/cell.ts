const CATEGORY_COLORS = [
  "blue",
  "teal",
  "grape",
  "orange",
  "cyan",
  "pink",
  "indigo",
  "red",
  "violet",
  "green",
] as const; // no lime/yellow: white labels are unreadable on them

/** Mantine "filled" tokens switch with the light/dark scheme, so cells follow the theme. */
export function categoryColor(index: number): string {
  const color =
    CATEGORY_COLORS[
      ((index % CATEGORY_COLORS.length) + CATEGORY_COLORS.length) % CATEGORY_COLORS.length
    ];
  return `var(--mantine-color-${color}-filled)`;
}

const MIN_LABEL_WIDTH = 64;
// Two text lines (category, then "year · count") need about 46px.
const MIN_LABEL_HEIGHT = 46;

/** Only draw text when the cell is big enough to hold it. */
export function canLabel(width: number, height: number): boolean {
  return width >= MIN_LABEL_WIDTH && height >= MIN_LABEL_HEIGHT;
}

export function tooltipText(category: string, year: string, count: number): string {
  return `${category} / ${year} — ${count} ${count === 1 ? "post" : "posts"}`;
}
