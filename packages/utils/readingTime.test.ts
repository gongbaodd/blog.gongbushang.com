import { describe, expect, test } from "vitest";
import { getWordNumber, getReadingTime } from "./readingTime";

describe("getWordNumber", () => {
  test("returns 0 for empty string", () => {
    expect(getWordNumber("")).toBe(0);
  });

  test("counts Latin words only", () => {
    expect(getWordNumber("Hello world")).toBe(2);
  });

  test("counts Chinese characters only", () => {
    expect(getWordNumber("你好世界")).toBe(4);
  });

  test("counts mixed Latin and Chinese", () => {
    expect(getWordNumber("Hello 世界 world")).toBe(4);
  });

  test("handles numbers and punctuation", () => {
    const content = "Word 123 and more.";
    expect(getWordNumber(content)).toBeGreaterThan(0);
  });
});

describe("getReadingTime", () => {
  test("returns minutes and words with default 300 wpm", () => {
    const result = getReadingTime("Hello world", 300);
    expect(result).toEqual({ minutes: 0.01, words: 2 });
  });

  test("uses custom wordsPerMinute", () => {
    const result = getReadingTime("one two three four five", 60);
    expect(result.words).toBe(5);
    expect(result.minutes).toBe(0.08);
  });

  test("returns zero minutes and words for empty content", () => {
    const result = getReadingTime("");
    expect(result).toEqual({ minutes: 0, words: 0 });
  });

  test("returns object with minutes and words shape", () => {
    const result = getReadingTime("Hello");
    expect(result).toHaveProperty("minutes");
    expect(result).toHaveProperty("words");
    expect(typeof result.minutes).toBe("number");
    expect(typeof result.words).toBe("number");
  });
});
