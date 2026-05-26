import { describe, expect, test } from "vitest";
import { md2txt } from "./md2txt";

describe("md2txt", () => {
  test("preserves image alt as plain text", async () => {
    const result = await md2txt(
      "Hello ![world](https://example.com/img.png) there"
    );
    expect(result).toBe("Hello world there");
  });

  test("replaces image with empty alt to empty string", async () => {
    const result = await md2txt("![](https://example.com/a.jpg)");
    expect(result).toBe("");
  });

  test("handles multiple images", async () => {
    const result = await md2txt(
      "![one](https://example.com/u1) and ![two](https://example.com/u2)"
    );
    expect(result).toBe("one and two");
  });

  test("strips full markdown while keeping image alt", async () => {
    const result = await md2txt(
      "# Title\n\n**bold** [link](https://example.com) ![caption](img.jpg)"
    );
    expect(result).toBe("Title\n\nbold link caption");
    expect(result).not.toContain("#");
    expect(result).not.toContain("**");
    expect(result).not.toContain("[");
    expect(result).not.toContain("img.jpg");
  });

  test("strips links but keeps label when no images", async () => {
    const result = await md2txt("plain text and [a link](https://example.com)");
    expect(result).toBe("plain text and a link");
  });

  test("ignores image title attribute", async () => {
    const result = await md2txt('![alt text](url "title")');
    expect(result).toBe("alt text");
  });
});
