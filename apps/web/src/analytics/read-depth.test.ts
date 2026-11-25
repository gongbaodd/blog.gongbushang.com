import { describe, expect, it } from "vitest";
import { newlyReached, readProgress } from "./read-depth";

describe("readProgress", () => {
  it("is 0 before content enters and 1 once its bottom is in view", () => {
    expect(readProgress(900, 2000, 800)).toBe(0);
    expect(readProgress(0, 2000, 1000)).toBe(0.5);
    expect(readProgress(-1500, 2000, 800)).toBe(1);
  });
  it("handles zero height", () => {
    expect(readProgress(0, 0, 800)).toBe(0);
  });
});

describe("newlyReached", () => {
  it("returns thresholds in order, skipping fired ones", () => {
    expect(newlyReached(0.6, new Set())).toEqual([25, 50]);
    expect(newlyReached(0.6, new Set([25]))).toEqual([50]);
  });
  it("short posts reach all thresholds at once", () => {
    expect(newlyReached(readProgress(100, 300, 900), new Set(), 300)).toEqual([25, 50, 75, 100]);
  });
  it("100 tolerates 2px slack", () => {
    expect(newlyReached(1 - 2 / 1000, new Set([25, 50, 75]), 1000)).toEqual([100]);
    expect(newlyReached(0.99, new Set([25, 50, 75]), 1000)).toEqual([]);
  });
});
