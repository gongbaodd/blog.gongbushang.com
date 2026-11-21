// Steps for the Mixpanel analytics journeys. All Mixpanel traffic is
// intercepted (see support/mixpanel.ts); nothing reaches the real service.
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "../support/expect";
import { FIXTURE_POST } from "../support/fixtures";
import { CONSENT_KEY, MixpanelRecorder } from "../support/mixpanel";
import type { BrowserWorld } from "../support/world";

declare module "../support/world" {
  interface BrowserWorld {
    mixpanel: MixpanelRecorder;
  }
}

let baselineEvents = 0;
const BANNER = "#analytics-consent";

async function ensureRecorder(world: BrowserWorld): Promise<MixpanelRecorder> {
  if (!world.mixpanel) {
    world.mixpanel = new MixpanelRecorder();
    await world.mixpanel.attach(world.page);
  }
  return world.mixpanel;
}

/** Let late idle-callback / dynamic-import work and batch flushes happen. */
const SETTLE_MS = 5_000;

Given("Mixpanel requests are intercepted", async function (this: BrowserWorld) {
  await ensureRecorder(this);
});

Given("the visitor has allowed analytics", async function (this: BrowserWorld) {
  await ensureRecorder(this);
  await this.context.addInitScript(
    // Seed only when unset so a later "denied" choice survives navigations.
    (key) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, "granted");
    },
    CONSENT_KEY,
  );
});

Given("I open the fixture post", async function (this: BrowserWorld) {
  await ensureRecorder(this);
  await this.visit(FIXTURE_POST.href);
});

Given("I open {string} with Mixpanel intercepted", async function (this: BrowserWorld, path: string) {
  await ensureRecorder(this);
  await this.visit(path);
});

When("I wait for analytics to settle", async function (this: BrowserWorld) {
  await this.page.waitForTimeout(SETTLE_MS);
});

When("I reload the page", async function (this: BrowserWorld) {
  await this.page.reload({ waitUntil: "load" });
});

When("I click {string} on the consent banner", async function (this: BrowserWorld, label: string) {
  const btn = this.page.locator(`${BANNER} button`, { hasText: label });
  await expect(btn).toBeVisible();
  await btn.evaluate((el) => (el as HTMLElement).click());
});

When("I scroll to the bottom of the article", async function (this: BrowserWorld) {
  // Scroll in steps so scroll handlers see the movement; stay at the very bottom.
  for (let i = 0; i < 4; i++) {
    await this.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await this.page.waitForTimeout(400);
  }
});

When("I choose {string} in the privacy analytics preferences", async function (this: BrowserWorld, label: string) {
  const id = label === "Allow" ? "#analytics-allow" : "#analytics-deny";
  const btn = this.page.locator(id);
  await expect(btn).toBeVisible();
  await btn.evaluate((el) => (el as HTMLElement).click());
  await expect(this.page.locator("#analytics-status")).not.toBeEmpty();
});

When("I count the Mixpanel events so far", async function (this: BrowserWorld) {
  baselineEvents = this.mixpanel.events().length;
});

Then("no request goes to a mixpanel.com host", async function (this: BrowserWorld) {
  expect(this.mixpanel.mixpanelDotComRequests).toEqual([]);
  expect(this.mixpanel.calls).toEqual([]);
});

Then("the analytics consent banner is not visible", async function (this: BrowserWorld) {
  await expect(this.page.locator(BANNER)).toBeHidden();
});

Then("the analytics consent banner is visible", async function (this: BrowserWorld) {
  await expect(this.page.locator(BANNER)).toBeVisible();
});

Then("no Mixpanel track or engage request has been sent", async function (this: BrowserWorld) {
  expect(this.mixpanel.dataCalls().map((c) => c.url)).toEqual([]);
});

Then("a Mixpanel track request with a page view event is sent", async function (this: BrowserWorld) {
  await expect
    .poll(() => this.mixpanel.events().map((e) => e.event), { timeout: 20_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/page[\s_]*view/i)]));
  expect(this.mixpanel.tracked("track").length).toBeGreaterThan(0);
});

Then("a Mixpanel {string} event with depth {int} is sent", async function (this: BrowserWorld, name: string, depth: number) {
  await expect
    .poll(
      () =>
        this.mixpanel
          .events(name)
          .map((e) => e.properties?.depth)
          .includes(depth),
      { timeout: 30_000, message: `${name} depth ${depth}` },
    )
    .toBe(true);
});

Then("the stored analytics consent is {string}", async function (this: BrowserWorld, value: string) {
  const stored = await this.page.evaluate((k) => window.localStorage.getItem(k), CONSENT_KEY);
  expect(stored).toBe(value);
});

Then("no further Mixpanel events have been sent", async function (this: BrowserWorld) {
  expect(this.mixpanel.events().length).toBe(baselineEvents);
});
