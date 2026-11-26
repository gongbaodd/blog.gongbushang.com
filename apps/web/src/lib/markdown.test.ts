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
