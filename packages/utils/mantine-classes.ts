import { DEFAULT_THEME, em, px } from "@mantine/core";

/**
 * Same CSS Mantine's `MantineClasses` renders per provider (visibleFrom/hiddenFrom helpers).
 * Emitted once in <head> so islands don't each ship (and hydrate) a copy.
 */
export function mantineGlobalClasses(): string {
  return Object.values(DEFAULT_THEME.breakpoints)
    .map((bp, i) => ({ name: Object.keys(DEFAULT_THEME.breakpoints)[i], bp }))
    .map(({ name, bp }) => {
      const isPx = bp.includes("px");
      const value = px(bp) as number;
      const max = isPx ? `${value - 0.1}px` : em(value - 0.1);
      const min = isPx ? `${value}px` : em(value);
      return `@media (max-width: ${max}) {.mantine-visible-from-${name} {display: none !important;}}@media (min-width: ${min}) {.mantine-hidden-from-${name} {display: none !important;}}`;
    })
    .join("");
}
