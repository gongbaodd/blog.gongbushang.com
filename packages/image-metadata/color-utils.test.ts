import { describe, expect, test } from "vitest";
import {
  findNearestTitleColor,
  isRemote,
  stripQuery,
} from "./src/color-utils.ts";

describe("isRemote", () => {
  test("detects http and https URLs", () => {
    expect(isRemote("https://example.com/img.jpg")).toBe(true);
    expect(isRemote("http://example.com/img.jpg")).toBe(true);
    expect(isRemote("./local.jpg")).toBe(false);
    expect(isRemote("/abs/path.jpg")).toBe(false);
  });
});

describe("stripQuery", () => {
  test("removes query string and hash", () => {
    expect(stripQuery("/img.jpg?v=1#top")).toBe("/img.jpg");
    expect(stripQuery("/img.jpg")).toBe("/img.jpg");
  });
});

describe("findNearestTitleColor", () => {
  test("returns a mantine CSS variable name", () => {
    const result = findNearestTitleColor("#ffd8a8");
    expect(result).toMatch(/^--mantine-color-/);
  });
});
