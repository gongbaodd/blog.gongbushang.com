import { describe, expect, test } from "vitest";
import {
  anniversaryDistance,
  parseGalleryDocDate,
  pickNearestGalleryEntry,
  type GalleryEntry,
} from "./gallery.ts";

function entry(
  id: string,
  doc: string,
  overrides: Partial<GalleryEntry> = {},
): GalleryEntry {
  return {
    id,
    file: id,
    hash: "",
    image: `https://example.com/${id}.jpg`,
    doc,
    ...overrides,
  };
}

describe("parseGalleryDocDate", () => {
  test("parses doc path date", () => {
    const date = parseGalleryDocDate(
      "/2019/05/25/take-another-black-golden-roof-again",
    );
    expect(date).toEqual(new Date(2019, 4, 25));
  });

  test("returns undefined for invalid doc", () => {
    expect(parseGalleryDocDate("/invalid")).toBeUndefined();
    expect(parseGalleryDocDate("")).toBeUndefined();
  });
});

describe("anniversaryDistance", () => {
  test("measures month/day distance ignoring year", () => {
    const ref = new Date(2026, 4, 30);
    const closer = new Date(2019, 4, 25);
    const farther = new Date(2020, 5, 15);

    expect(anniversaryDistance(ref, closer)).toBe(5);
    expect(anniversaryDistance(ref, farther)).toBe(16);
  });

  test("wraps around year boundary", () => {
    const ref = new Date(2026, 0, 2);
    const dec31 = new Date(2010, 11, 31);

    expect(anniversaryDistance(ref, dec31)).toBe(2);
  });
});

describe("pickNearestGalleryEntry", () => {
  test("returns undefined when gallery is empty", () => {
    expect(pickNearestGalleryEntry([], new Date(2026, 4, 30))).toBeUndefined();
  });

  test("returns single valid entry", () => {
    const images = [
      entry("05/25/shenzhen", "/2019/05/25/take-another-black-golden-roof-again"),
    ];

    const result = pickNearestGalleryEntry(images, new Date(2026, 4, 30));
    expect(result?.id).toBe("05/25/shenzhen");
  });

  test("picks closest anniversary entry", () => {
    const images = [
      entry("05/25/shenzhen", "/2019/05/25/take-another-black-golden-roof-again"),
      entry("06/15/beijing", "/2020/06/15/summer-walk"),
    ];

    const result = pickNearestGalleryEntry(images, new Date(2026, 4, 30));
    expect(result?.id).toBe("05/25/shenzhen");
  });

  test("skips entries with invalid doc", () => {
    const images = [
      entry("bad", "not-a-doc"),
      entry("05/25/shenzhen", "/2019/05/25/take-another-black-golden-roof-again"),
    ];

    const result = pickNearestGalleryEntry(images, new Date(2026, 4, 30));
    expect(result?.id).toBe("05/25/shenzhen");
  });

  test("tie-breaks by id", () => {
    const images = [
      entry("b/entry", "/2019/05/25/b"),
      entry("a/entry", "/2019/05/25/a"),
    ];

    const result = pickNearestGalleryEntry(images, new Date(2026, 4, 30));
    expect(result?.id).toBe("a/entry");
  });
});
