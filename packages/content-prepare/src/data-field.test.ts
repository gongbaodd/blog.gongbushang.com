import { describe, expect, test } from "vitest";
import {
  buildSeriesNameMap,
  categoryFromFrontmatter,
  dateFromSlug,
  extractDataFields,
  seriesFromFrontmatter,
  tagsFromFrontmatter,
  titleFromBody,
} from "./data-field.ts";

describe("titleFromBody", () => {
  test("returns first ATX heading", () => {
    expect(
      titleFromBody("# Hello World\n\nSome text", "2024/01/01/hello"),
    ).toBe("Hello World");
  });

  test("falls back to slug segment with dashes as spaces", () => {
    expect(titleFromBody("No heading here", "2024/01/01/hello-world")).toBe(
      "hello world",
    );
  });
});

describe("dateFromSlug", () => {
  test("parses YYYY/MM/DD from slug", () => {
    const result = dateFromSlug("2024/01/15/my-slug");
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
  });
});

describe("tagsFromFrontmatter", () => {
  test("returns empty array when tag is missing", () => {
    expect(tagsFromFrontmatter(undefined)).toEqual([]);
  });

  test("returns lowercased tags with hrefs", () => {
    expect(tagsFromFrontmatter(["React", "TypeScript"])).toEqual([
      { label: "react", href: "/tag/react" },
      { label: "typescript", href: "/tag/typescript" },
    ]);
  });
});

describe("categoryFromFrontmatter", () => {
  test("returns label and href", () => {
    expect(categoryFromFrontmatter("travel")).toEqual({
      label: "travel",
      href: "/travel",
    });
  });
});

describe("seriesFromFrontmatter", () => {
  test("uses series.name when present", () => {
    const map = new Map<string, string>();
    expect(
      seriesFromFrontmatter({ slug: "vibe-coding", name: "Vibe Coding" }, map),
    ).toEqual({
      label: "Vibe Coding",
      href: "/series/vibe-coding",
    });
  });

  test("falls back to series name map then slug", () => {
    const map = new Map([["math", "高等数学"]]);
    expect(seriesFromFrontmatter({ slug: "math" }, map)).toEqual({
      label: "高等数学",
      href: "/series/math",
    });
    expect(seriesFromFrontmatter({ slug: "unknown" }, map)).toEqual({
      label: "unknown",
      href: "/series/unknown",
    });
  });
});

describe("buildSeriesNameMap", () => {
  test("collects slug to name mappings", () => {
    const map = buildSeriesNameMap([
      { series: { slug: "a", name: "Series A" } },
      { series: { slug: "b" } },
      { series: { slug: "c", name: "Series C" } },
    ]);
    expect(map.get("a")).toBe("Series A");
    expect(map.get("c")).toBe("Series C");
    expect(map.has("b")).toBe(false);
  });
});

describe("extractDataFields", () => {
  test("extracts post data fields from markdown", async () => {
    const seriesNameMap = new Map([["vibe-coding", "Vibe Coding"]]);
    const result = await extractDataFields(
      "2026/02/25/ai-agents",
      {
        category: "tech",
        tag: ["LLM", "vibe-coding"],
        series: { slug: "vibe-coding" },
        city: ["Krakow, Poland"],
      },
      "# AI Agents\n\nLocal LLM notes.",
      seriesNameMap,
    );

    expect(result.id).toBe("2026/02/25/ai-agents");
    expect(result.href).toBe("/tech/2026/02/25/ai-agents");
    expect(result.title).toBe("AI Agents");
    expect(new Date(result.date).getFullYear()).toBe(2026);
    expect(result.content).toContain("Local LLM notes");
    expect(result.category).toEqual({ label: "tech", href: "/tech" });
    expect(result.tags).toEqual([
      { label: "llm", href: "/tag/llm" },
      { label: "vibe-coding", href: "/tag/vibe-coding" },
    ]);
    expect(result.series).toEqual({
      label: "Vibe Coding",
      href: "/series/vibe-coding",
    });
    expect(result.city).toEqual(["Krakow, Poland"]);
  });
});
