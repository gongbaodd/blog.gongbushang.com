// Typed per-scenario Cucumber World.
// Each scenario gets its own Playwright BrowserContext + Page (created in the
// Before hook, closed in After) so no cookies, storage or page state leak
// between scenarios. Keep step imports relative to e2e/ — the Cucumber/Node
// loader does not know Astro's `@/` alias.
import { setDefaultTimeout, World, setWorldConstructor } from "@cucumber/cucumber";
import type { BrowserContext, Page } from "playwright";

// Cucumber v13 no longer reads `timeout` from the config file; the default
// 5s step timeout is far too short for page loads, heavy client hydration and
// the bounded click-retry loops used for late-hydrating islands.
setDefaultTimeout(90_000);

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4321";

export class BrowserWorld extends World {
  context!: BrowserContext;
  page!: Page;
  baseUrl: string = BASE_URL;
  /** Main-frame navigation response of the most recent `visit`. */
  lastResponse: Response | null = null;

  /**
   * Navigate to a path on the site under test, resolving against the fixed
   * base URL so tests never depend on the ambient port.
   */
  async visit(path: string): Promise<void> {
    const url = new URL(path, this.baseUrl).toString();
    this.lastResponse = await this.page.goto(url, { waitUntil: "load" });
  }
}

setWorldConstructor(BrowserWorld);
