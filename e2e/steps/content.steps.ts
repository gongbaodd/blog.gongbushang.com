// Steps asserting rich content rendering inside committed posts:
// shiki syntax highlighting (pre.astro-code) is built at build time, and
// KaTeX math (rehype-katex) is rendered server-side into .katex spans.
import { Then } from "@cucumber/cucumber";
import { expect } from "../support/expect";
import type { BrowserWorld } from "../support/world";

Then("I see highlighted code", async function (this: BrowserWorld) {
  // Shiki emits per-token coloured spans; their presence proves highlighting.
  await expect(this.page.locator("pre.astro-code span[style]").first()).toBeVisible();
});

Then("I see rendered math", async function (this: BrowserWorld) {
  // rehype-katex renders formulas during the static build.
  await expect(this.page.locator(".katex").first()).toBeVisible();
});
