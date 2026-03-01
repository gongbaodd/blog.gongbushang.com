import { describe, expect, test } from "vitest";
import { stripHtml } from "./stripHtml";

describe("stripHtml", () => {
  test("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  test("strips HTML tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });

  test("replaces &nbsp; with space", () => {
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  test("decodes &amp; to &", () => {
    expect(stripHtml("a&amp;b")).toBe("a&b");
  });

  test("decodes &lt; and &gt; to < and >", () => {
    expect(stripHtml("&lt;tag&gt;")).toBe("<tag>");
  });

  test("decodes &quot; to double quote", () => {
    expect(stripHtml('&quot;x&quot;')).toBe('"x"');
  });

  test("collapses whitespace and trims", () => {
    expect(stripHtml("  a   b   c  ")).toBe("a b c");
  });

  test("combined: tags, entities, and whitespace", () => {
    expect(stripHtml("<p>  a &amp; b  </p>")).toBe("a & b");
  });
});
