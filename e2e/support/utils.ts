import type { Page } from "playwright";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a RegExp that matches a page URL for `path` regardless of whether the
 * preview server normalizes it with a trailing slash.
 */
export function pageUrlPattern(baseUrl: string, path: string): RegExp {
  const origin = escapeRegExp(baseUrl.replace(/\/$/, ""));
  const pathname = escapeRegExp(path.replace(/\/$/, ""));
  return new RegExp(`^${origin}${pathname}/?(?:[?#].*)?$`);
}

/**
 * Wait until the element matched by `selector` has survived a remount.
 *
 * The site's islands are server-rendered and hydrated later. On heavy pages
 * (home) hydration errors make React re-render an island several times in a
 * row; a click dispatched onto a node that is about to be replaced is
 * silently dropped. Polling until the same DOM node is seen twice in a row
 * means the island has settled and the element is safe to interact with.
 * (`waitForFunction` polls with setInterval here — frame-rate independent.)
 */
export async function waitForSelectorSettled(
  page: Page,
  selector: string,
  timeout = 60_000,
): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const w = window as unknown as { __e2eSettled?: Record<string, Element> };
      w.__e2eSettled ??= {};
      const el = document.querySelector(sel);
      if (el && w.__e2eSettled[sel] === el) return true;
      if (el) w.__e2eSettled[sel] = el;
      return false;
    },
    selector,
    { polling: 400, timeout },
  );
}

/**
 * Click an element by dispatching a DOM click event in the page.
 *
 * Playwright's locator.click relies on requestAnimationFrame-based
 * actionability polling, which starves in headless Chromium on this site's
 * animation-heavy pages (canvas/WebGL islands keep the compositor busy while
 * headless produces only ~2 frames per second), so clicks can hang before
 * dispatching. An in-page click dispatches the same DOM event the browser
 * would (React handlers and native anchor navigation both react to it) and
 * is frame-rate independent. Waiting for the element (resolution), for the
 * navigation, and all assertions still go through Playwright.
 */
export async function clickInPage(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((el) => (el as HTMLElement).click());
}

/**
 * Click `clickSelector` in the page (on an interval) until `targetSelector`
 * becomes present.
 *
 * Used for header controls whose behaviour only exists after React hydration
 * (mobile drawer, search dialog): instead of guessing when hydration
 * finished, poll — clicking again is harmless — and resolve as soon as the
 * target UI is in the DOM. Uses setInterval polling, so it does not depend
 * on frame production (which is starved on animation-heavy pages in
 * headless Chromium).
 */
export async function clickUntilPresent(
  page: Page,
  clickSelector: string,
  targetSelector: string,
  timeout = 60_000,
): Promise<void> {
  await page.waitForFunction(
    ({ click, target }) => {
      if (document.querySelector(target)) return true;
      const el = document.querySelector(click);
      if (el) (el as HTMLElement).click();
      return false;
    },
    { click: clickSelector, target: targetSelector },
    { polling: 600, timeout },
  );
}
