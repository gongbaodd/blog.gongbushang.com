import { describe, expect, test } from "vitest";
import { canLabel, categoryColor, tooltipText } from "./cell";

describe("categoryColor", () => {
  test("returns a Mantine filled token", () => {
    expect(categoryColor(0)).toBe("var(--mantine-color-blue-filled)");
  });

  test("wraps around the palette, including negative indexes", () => {
    expect(categoryColor(10)).toBe(categoryColor(0));
    expect(categoryColor(-1)).toBe(categoryColor(9));
  });
});

describe("canLabel", () => {
  test("needs room for both width and height", () => {
    expect(canLabel(120, 60)).toBe(true);
    expect(canLabel(40, 60)).toBe(false);
    expect(canLabel(120, 20)).toBe(false);
    // Too short to fit the second line without clipping.
    expect(canLabel(120, 40)).toBe(false);
  });
});

describe("tooltipText", () => {
  test("formats category, year and count", () => {
    expect(tooltipText("tech", "2020", 5)).toBe("tech / 2020 — 5 posts");
  });

  test("uses the singular for one post", () => {
    expect(tooltipText("life", "2017", 1)).toBe("life / 2017 — 1 post");
  });
});
