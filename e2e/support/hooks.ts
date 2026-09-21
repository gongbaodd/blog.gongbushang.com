// Browser/context lifecycle for the Cucumber suite.
// - One Chromium browser per Cucumber worker (BeforeAll/AfterAll).
// - One fresh browser context + page per scenario (Before/After): no cookies,
//   local storage or page state leak between scenarios.
// - Failed scenarios leave evidence: a PNG screenshot attached to the Cucumber
//   report (and mirrored to e2e-results/screenshots/), plus an optional
//   Playwright trace when E2E_TRACE=1. Playwright traces capture browser
//   activity but not Cucumber assertions, so the Cucumber report remains the
//   assertion record.
import { After, AfterAll, Before, BeforeAll, Status } from "@cucumber/cucumber";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { FIXTURE_POST } from "./fixtures";
import { BrowserWorld } from "./world";

const RESULTS_DIR = "e2e-results";
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

let browser: Browser | null = null;

BeforeAll(async function () {
  browser = await chromium.launch({
    headless: process.env.E2E_HEADED !== "1",
  });
});

Before(async function (this: BrowserWorld, { pickle }) {
  const isMobile = pickle.tags.some((tag) => tag.name === "@mobile");

  this.context = await browser!.newContext({
    baseURL: this.baseUrl,
    viewport: isMobile ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT,
  });

  if (process.env.E2E_TRACE === "1") {
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }

  this.page = await this.context.newPage();
  stubOptionalExternalServices(this.page);
});

After(async function (this: BrowserWorld, { pickle, result }) {
  const failed = result?.status === Status.FAILED;
  const slug = slugify(pickle.name);

  try {
    if (failed && this.page && !this.page.isClosed()) {
      const screenshot = await this.page.screenshot({ fullPage: true });
      await this.attach(screenshot, "image/png");

      const screenshotsDir = path.join(RESULTS_DIR, "screenshots");
      await fs.mkdir(screenshotsDir, { recursive: true });
      await fs.writeFile(path.join(screenshotsDir, `${slug}.png`), screenshot);
    }

    if (this.context) {
      if (process.env.E2E_TRACE === "1") {
        const tracesDir = path.join(RESULTS_DIR, "traces");
        await fs.mkdir(tracesDir, { recursive: true });
        await this.context.tracing.stop({ path: path.join(tracesDir, `${slug}.zip`) });
      }
      await this.context.close();
    }
  } finally {
    this.page = undefined as unknown as BrowserWorld["page"];
    this.context = undefined as unknown as BrowserWorld["context"];
  }
});

AfterAll(async function () {
  await browser?.close();
  browser = null;
});

/**
 * The public view counter (pv.growgen.xyz) is an optional external service.
 * Scenarios must not depend on it being reachable, and the search journey
 * filters indexed posts by recorded view counts — so every scenario fulfils
 * it deterministically instead of hitting the network. The fixture post is
 * reported as viewed so it survives that filter in the search scenario.
 * Other optional services (analytics, Cloudinary covers, Spotify embeds) are
 * left untouched; no assertion depends on them.
 */
function stubOptionalExternalServices(page: BrowserWorld["page"]): void {
  const host = "pv.growgen.xyz";

  page.route(`https://${host}/**`, async (route) => {
    const url = new URL(route.request().url());
    const body =
      url.pathname === "/pv" ? { hits: [{ count: 1, path: FIXTURE_POST.href }] } : { hits: [] };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

function slugify(value: string): string {
  return (value || "scenario")
    .replace(/[^\w-]+/g, "-")
    .slice(0, 80)
    .toLowerCase();
}
