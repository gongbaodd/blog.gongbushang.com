export const READ_DEPTHS = [25, 50, 75, 100] as const;
export type ReadDepth = (typeof READ_DEPTHS)[number];

/**
 * Fraction (0..1) of an element that has scrolled into view from the top:
 * how far the viewport bottom has travelled through the element.
 * `top`/`height` are viewport-relative (getBoundingClientRect).
 */
export function readProgress(top: number, height: number, viewportHeight: number): number {
  if (height <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportHeight - top) / height));
}

/** Thresholds reached at `progress` that are not in `fired`, ascending. 100 allows 2px slack. */
export function newlyReached(
  progress: number,
  fired: ReadonlySet<number>,
  height = 0,
): ReadDepth[] {
  const slack = height > 0 ? 2 / height : 0;
  return READ_DEPTHS.filter((d) => !fired.has(d) && progress + (d === 100 ? slack : 0) >= d / 100);
}
