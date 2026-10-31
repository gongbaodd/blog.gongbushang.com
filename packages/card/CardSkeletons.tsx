import { Stack } from "@mantine/core";
import { AsciiSkeleton } from "ascii-reveal";

/** Number of placeholder cards appended to the masonry while the next page streams in. */
export const SKELETON_CARD_COUNT = 5;

/** Card colours: `bgColor` is a CSS color, `titleColor` a CSS variable name (e.g. `--mantine-color-green-4`). */
export interface ISkeletonColors {
  bgColor?: string;
  titleColor?: string;
}

export interface ISkeletonItem extends ISkeletonColors {
  skeleton: number;
}

const FALLBACK_COLORS: ISkeletonColors = { titleColor: "--mantine-primary-color-filled" };

/**
 * Placeholders tinted with the colors of the cards already shown, so they look like the cards to come.
 * Cards with a cover photo carry no colors; without any colored card the theme color is used.
 */
export function skeletonItems(
  palette: ISkeletonColors[] = [],
  count = SKELETON_CARD_COUNT,
): ISkeletonItem[] {
  const colored = palette.filter((c) => c.bgColor && c.titleColor);
  return Array.from({ length: count }, (_, skeleton) => ({
    skeleton,
    ...(colored.length ? colored[(skeleton * 3 + 1) % colored.length] : FALLBACK_COLORS),
  }));
}

export function isSkeletonItem(item: object): item is ISkeletonItem {
  return "skeleton" in item;
}

/** Card-shaped ASCII placeholder; sits in a masonry slot at the same width as a real card. */
export function CardSkeleton({
  seed,
  bgColor,
  titleColor,
}: { seed: number } & ISkeletonColors) {
  return (
    <Stack
      gap="xs"
      w="100%"
      miw={280}
      role="status"
      aria-label="Loading"
      style={{
        background: bgColor ?? "var(--mantine-color-body)",
        borderRadius: 16,
        overflow: "hidden",
        ...(titleColor ? { "--ascii-skeleton": `var(${titleColor})` } : {}),
      }}
    >
      <AsciiSkeleton as="div" rows={17} width="100%" height={272} seed={seed} />
      <AsciiSkeleton as="div" lines={2} widths={["90%", "62%"]} seed={seed + 11} />
      <AsciiSkeleton as="div" lines={2} seed={seed + 21} />
    </Stack>
  );
}
