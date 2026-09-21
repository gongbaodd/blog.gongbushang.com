// Steps for the site header navigation (desktop links + mobile drawer) and
// for moving between the blog list and a post. All waiting is driven by
// Playwright (element resolution, URL changes, visibility assertions) —
// there are no fixed sleeps anywhere in the suite.
import { Then, When } from "@cucumber/cucumber";
import { expect } from "../support/expect";
import {
  clickInPage,
  clickUntilPresent,
  pageUrlPattern,
  waitForSelectorSettled,
} from "../support/utils";
import type { BrowserWorld } from "../support/world";

const drawer = (page: BrowserWorld["page"]) => page.getByRole("dialog", { name: "Navigation" });

// Header links use fixed hrefs (packages/consts ROUTE_HREF).
const navLinkHref = (label: string): string => {
  const hrefs: Record<string, string> = {
    Home: "/",
    Blog: "/all",
    Lab: "/lab",
    World: "/world",
    Archive: "/year",
  };
  const href = hrefs[label];
  if (!href) throw new Error(`unknown navigation link "${label}"`);
  return href;
};

async function firstPostHref(page: BrowserWorld["page"]): Promise<string> {
  // Post cards render client-side after the list page hydrates, so poll until
  // at least one exists. Anchor on the post href shape (/{category}/{year}/…)
  // rather than a specific post so content submodule churn cannot break the
  // suite. The callback runs inside the browser and cannot close over
  // Node-side constants, hence the inline regex.
  let href = "";
  await expect(async () => {
    const candidates = await page
      .locator("a")
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((value): value is string => !!value && /^\/[a-z0-9-]+\/20\d{2}\//.test(value)),
      );
    expect(candidates, "expected at least one post link").not.toHaveLength(0);
    href = candidates[0]!;
  }).toPass({ timeout: 30_000 });
  return href;
}

When("I click the {string} navigation link", async function (this: BrowserWorld, label: string) {
  const href = navLinkHref(label);
  const selector = `header a[href="${href}"]`;
  const before = this.page.url();

  // A click dispatched while React replaces the hydrated header is dropped,
  // so wait for the anchor to settle, then click and judge success by the
  // URL — never by the click result alone.
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForSelectorSettled(this.page, selector, 30_000);
    await clickInPage(this.page, selector);
    try {
      await this.page.waitForURL((url) => url.toString() !== before, {
        timeout: 5_000,
        waitUntil: "commit",
      });
      return;
    } catch {
      // No navigation committed; let the anchor settle again and retry.
    }
  }
  throw new Error(`clicking the "${label}" navigation link did not navigate away from ${before}`);
});

Then(
  "I see a visible {string} navigation link",
  async function (this: BrowserWorld, label: string) {
    await expect(
      this.page.locator("header").getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  },
);

Then("I land on {string}", async function (this: BrowserWorld, path: string) {
  await expect(this.page).toHaveURL(pageUrlPattern(this.baseUrl, path));
});

Then("I see at least one post link", async function (this: BrowserWorld) {
  await firstPostHref(this.page);
});

When("I open the first post", async function (this: BrowserWorld) {
  const href = await firstPostHref(this.page);
  const before = this.page.url();

  // Same contract as the navigation-link click: judge success by the URL.
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForSelectorSettled(this.page, `a[href="${href}"]`, 30_000);
    await clickInPage(this.page, `a[href="${href}"]`);
    try {
      await this.page.waitForURL(pageUrlPattern(this.baseUrl, href), {
        timeout: 5_000,
        waitUntil: "commit",
      });
      await expect(this.page).toHaveURL(pageUrlPattern(this.baseUrl, href));
      return;
    } catch {
      // No navigation committed; let the card settle again and retry.
    }
  }
  throw new Error(`opening the first post (${href}) did not navigate away from ${before}`);
});

Then("I see a post heading", async function (this: BrowserWorld) {
  const heading = this.page.locator(".prose").getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveText("");
});

Then("I see post content", async function (this: BrowserWorld) {
  await expect(this.page.locator(".prose").first()).toBeVisible();
});

When("I go back", async function (this: BrowserWorld) {
  await this.page.goBack({ waitUntil: "load" });
});

When("I open the navigation menu", async function (this: BrowserWorld) {
  // The drawer trigger is an icon-only button (lucide Menu icon) inside the
  // header island. Its behaviour only exists after hydration, so click on an
  // interval until the drawer dialog is present instead of guessing when
  // hydration finished.
  await clickUntilPresent(
    this.page,
    "header button:has(svg.lucide-menu)",
    "[role='dialog']",
    60_000,
  );
  await expect(drawer(this.page)).toBeVisible();
});

When(
  "I follow {string} in the navigation drawer",
  async function (this: BrowserWorld, label: string) {
    const href = navLinkHref(label);
    const itemSelector = `.mantine-Drawer-content a[href="${href}"]`;

    // Drawer items live in an embla carousel; advance with its own controls
    // until the requested slide is clickable instead of guessing positions.
    const nextSelector = '.mantine-Drawer-content button[aria-label="Next slide"]';
    for (let attempts = 0; attempts < 6; attempts++) {
      if (await this.page.locator(itemSelector).first().isVisible()) break;
      if (
        !(await this.page
          .locator(nextSelector)
          .first()
          .isVisible()
          .catch(() => false))
      )
        break;
      await clickInPage(this.page, nextSelector);
    }

    await waitForSelectorSettled(this.page, itemSelector, 30_000);
    await clickInPage(this.page, itemSelector);
  },
);
