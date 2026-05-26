import path from "node:path";
import { describe, expect, test } from "vitest";
import { toMetadataSlug, toUnixPath } from "./src/path-utils.ts";

describe("toUnixPath", () => {
  test("normalizes separators", () => {
    expect(toUnixPath(`a${path.sep}b${path.sep}c`)).toBe("a/b/c");
  });
});

describe("toMetadataSlug", () => {
  test("normalizes markdown paths into metadata slugs", () => {
    expect(toMetadataSlug("2015/04/12/apocalypse-of-the-bohai-sea.md")).toBe(
      "2015/04/12/apocalypse-of-the-bohai-sea",
    );
  });

  test("lowercases and strips punctuation", () => {
    expect(toMetadataSlug("2020/Hello, World!.md")).toBe("2020/helloworld");
  });

  test("collapses slashes and trims hyphens", () => {
    expect(toMetadataSlug("--foo//bar--.md")).toBe("foo/bar");
  });
});
