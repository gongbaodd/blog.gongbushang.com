import { describe, expect, test } from "vitest";
import { buildEmbeddingText } from "./embedding.ts";

describe("buildEmbeddingText", () => {
  test("includes required fields and omits optional ones", () => {
    const text = buildEmbeddingText({
      title: "Hello",
      category: { label: "travel", href: "/travel" },
      tags: [],
      content: "Plain body text",
    });

    expect(text).toBe(
      "title: Hello\ncategory: life\ncontent: Plain body text",
    );
  });

  test("includes series, tags, and city when present", () => {
    const text = buildEmbeddingText({
      title: "Hello",
      category: { label: "travel", href: "/travel" },
      series: { label: "Tokyo Trip", href: "/series/tokyo-trip" },
      tags: [
        { label: "food", href: "/tag/food" },
        { label: "japan", href: "/tag/japan" },
      ],
      city: ["Tokyo", "Kyoto"],
      content: "Plain body text",
    });

    expect(text).toBe(
      [
        "title: Hello",
        "category: life",
        "series: Tokyo Trip",
        "tags: food, japan",
        "city: Tokyo, Kyoto",
        "content: Plain body text",
      ].join("\n"),
    );
  });
});
