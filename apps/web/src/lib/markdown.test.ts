import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

// tetris-ai (legacy .mdx): a 4-space-indented list after a blank line is a list in MDX, code in CommonMark.
const SRC =
  "Opponent evil choices:\n    \n    - Move A → picks **A3 = 2**\n    - Move B → picks **B1 = 4**\n\nDone.\n";

// The first render cold-loads the unified/Shiki pipeline, which exceeds vitest's 5s default on CI runners.
describe("renderMarkdown indented blocks", { timeout: 30_000 }, () => {
  it("keeps CommonMark indented code for .md bodies", async () => {
    const { html } = await renderMarkdown(SRC);
    expect(html).toContain("<pre");
    expect(html).not.toContain("<li>");
  });

  it("renders the indented list as a list for .mdx bodies (no indented code)", async () => {
    const { html } = await renderMarkdown(SRC, { mdx: true });
    expect(html).not.toContain("<pre");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("still renders fenced code in mdx mode", async () => {
    const { html } = await renderMarkdown("```js\nconst a = 1;\n```\n", { mdx: true });
    expect(html).toContain("<pre");
  });
});

describe("renderMarkdown body h1", { timeout: 30_000 }, () => {
  const WITH_H1 = "# My Title\n\nIntro.\n\n## Section\n\nText.\n";
  const NO_H1 = "Intro.\n\n## Section\n\nText.\n\n### Sub\n";

  it("removes the body h1 from html and the menu headings", async () => {
    const { html, menuHeadings } = await renderMarkdown(WITH_H1);
    expect(html).not.toMatch(/<h1[\s>]/);
    expect(html).toContain("<h2");
    expect(menuHeadings.map((h) => h.text)).toEqual(["Section"]);
  });

  it("keeps the h1 in headings so the SEO title rule still works", async () => {
    const { headings } = await renderMarkdown(WITH_H1);
    expect(headings[0]).toMatchObject({ depth: 1, text: "My Title" });
  });

  it("removes every body h1 in mdx mode too", async () => {
    const { html } = await renderMarkdown("# A\n\ntext\n\n# B\n", { mdx: true });
    expect(html).not.toMatch(/<h1[\s>]/);
  });

  it("keeps h1 markup shown inside code blocks", async () => {
    const { html } = await renderMarkdown("# T\n\n```html\n<h1>x</h1>\n```\n");
    expect(html).toContain("<pre");
    expect(html).toContain(">x&#x3C;/");
    expect(html).not.toMatch(/<h1[\s>]/);
  });

  it("leaves posts without an h1 unchanged", async () => {
    const { html, headings, menuHeadings } = await renderMarkdown(NO_H1);
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(menuHeadings).toEqual(headings);
    expect(menuHeadings.map((h) => h.text)).toEqual(["Section", "Sub"]);
  });
});
