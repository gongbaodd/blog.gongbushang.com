// Opens sample routes in headless Chromium and fails on hydration errors.
// Usage: node scripts/hydration-check.mjs [baseUrl]   (run `pnpm dev` first for full messages)
// HYD_ROUTES_FILE=<file>  one route per line (blank lines and # comments ignored); apps/web uses tests/hydration-routes.txt.
// E2E_CHROME_CHANNEL=chrome  use the installed Chrome when Playwright's bundled Chromium is missing.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321";
const routes = process.env.HYD_ROUTES_FILE
  ? readFileSync(process.env.HYD_ROUTES_FILE, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
  : ["/", "/all", "/year/2025", "/lab", "/tag/react", "/podcast"];

const browser = await chromium.launch(process.env.E2E_CHROME_CHANNEL ? { channel: process.env.E2E_CHROME_CHANNEL } : {});
let failed = false;
for (const route of routes) {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 120000 }).catch((e) => errors.push(String(e)));
  await page.waitForTimeout(1500);
  const bad = errors.filter((e) => /hydrat|#418|#423|#425|did not match/i.test(e));
  console.log(`${bad.length ? "FAIL" : "ok  "} ${route}  (${errors.length} console errors)`);
  for (const e of bad) console.log("   ", e.slice(0, +(process.env.HYD_LEN ?? 1500)));
  if (bad.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
