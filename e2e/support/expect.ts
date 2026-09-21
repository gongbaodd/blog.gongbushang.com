// Project-wide Playwright web-first assertions with a timeout tuned for the
// site's heavy client-side hydration (masonry lists, search index, mermaid).
// Import `expect` from here in steps instead of from "playwright/test".
import { expect as baseExpect } from "playwright/test";

export const expect = baseExpect.configure({ timeout: 20_000 });
