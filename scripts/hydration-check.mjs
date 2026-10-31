// Opens sample routes in headless Chromium and fails on hydration errors.
// Usage: node scripts/hydration-check.mjs [baseUrl]   (run `pnpm dev` first for full messages)
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321";
const routes = ["/", "/all", "/year/2025", "/lab", "/tag/react"];

const browser = await chromium.launch();
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
