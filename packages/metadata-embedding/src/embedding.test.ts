import { describe, expect, test } from "vitest";
import {
  buildPodcastEmbeddingText,
  buildPostEmbeddingText,
} from "./embedding.ts";

describe("buildPostEmbeddingText", () => {
  test("includes required fields and omits optional ones", () => {
    const text = buildPostEmbeddingText({
      title: "Hello",
      category: { label: "travel" },
      tags: [],
      content: "Plain body text",
    });

    expect(text).toBe(
      "title: Hello\ncategory: travel\ncontent: Plain body text",
    );
  });

  test("includes series, tags, and city when present", () => {
    const text = buildPostEmbeddingText({
      title: "Hello",
      category: { label: "travel" },
      series: { label: "Tokyo Trip" },
      tags: [
        { label: "food" },
        { label: "japan" },
      ],
      city: ["Tokyo", "Kyoto"],
      content: "Plain body text",
    });

    expect(text).toBe(
      [
        "title: Hello",
        "category: travel",
        "series: Tokyo Trip",
        "tags: food, japan",
        "city: Tokyo, Kyoto",
        "content: Plain body text",
      ].join("\n"),
    );
  });
});

describe("buildPodcastEmbeddingText", () => {
  test("uses title|podcast|summary pipe format", () => {
    expect(
      buildPodcastEmbeddingText({
        title: "Episode title",
        summary: "Short summary",
      }),
    ).toBe("Episode title|podcast|Short summary");
  });
});
