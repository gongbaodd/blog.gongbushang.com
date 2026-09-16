// Build-time CV PDF generator: renders each static resume page with headless
// Chromium and prints it to a single-page A4 PDF. Run after `astro build`:
//   node ./packages/resume/generate-pdfs.mjs
// Enforces: 1 page per PDF, <= 2 MB per file, no clipped `.sheet` content,
// and translated headline/name present in the DOM before printing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const resumeRoles = ["universal", "full-stack", "machine-learning", "devops", "game-dev", "ai-agent", "product-engineer"];
const resumeLanguages = ["en", "zh"];
const MAX_BYTES = 2 * 1024 * 1024;

const root = fileURLToPath(new URL("../..", import.meta.url));
const dist = join(root, "dist");
const outDir = join(dist, "resume", "pdfs");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".pdf": "application/pdf" };

function serveStatic() {
  return createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let file = join(dist, urlPath === "/" ? "index.html" : urlPath.slice(1));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file) && !extname(file)) {
      const html = `${file}.html`;
      if (existsSync(html)) file = html;
    }
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    readFile(file).then((buf) => res.end(buf)).catch(() => {
      res.writeHead(500);
      res.end("read error");
    });
  });
}

function countPdfPages(buf) {
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

const combos = resumeRoles.flatMap((role) => resumeLanguages.map((language) => ({ role, language })));

if (!existsSync(join(dist, "resume", "index.html"))) {
  console.error(`dist not found at ${dist}. Run \`astro build\` first.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const server = serveStatic();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const browser = await puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
});

const failures = [];
try {
  for (const { role, language } of combos) {
    const pagePath = role === "universal" && language === "en" ? "/resume/" : `/resume/${role}/${language}/`;
    const url = `http://127.0.0.1:${port}${pagePath}`;
    const fileName = `jian-gong-${role}-${language}.pdf`;
    const outFile = join(outDir, fileName);
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
      // Let fonts/images settle; selector links must exist for a11y/sharing.
      await page.waitForSelector(".resume-scale .sheet", { timeout: 15000 });
      // Webfonts use `font-display: swap`, so the first paint (and networkidle0)
      // can happen before the CJK/Thai subsets apply. Printing at that moment
      // bakes tofu into the PDF on machines without system CJK fonts (e.g. the
      // Vercel build env). Wait until the subset faces actually render our
      // representative glyphs before printing.
      try {
        // NOTE: Thai bold is (currently) unused in the layout, so its face
        // would never load on its own — `load()` it explicitly anyway so the
        // check below reflects readiness, not usage.
        await page.waitForFunction(
          async () => {
            const sc = "宫日本語";
            const thai = "ภาษาไทย";
            const specs = [
              ['400 10px "Noto Sans SC"', sc],
              ['700 10px "Noto Sans SC"', sc],
              ['400 10px "Noto Sans Thai"', thai],
              ['700 10px "Noto Sans Thai"', thai],
            ];
            try {
              await Promise.all(specs.map(([font, text]) => document.fonts.load(font, text)));
            } catch {
              return false;
            }
            return specs.every(([font, text]) => document.fonts.check(font, text));
          },
          { timeout: 30000, polling: 500 },
        );
      } catch {
        failures.push(`${role}/${language}: CJK/Thai subset fonts did not load before print`);
      }
      const check = await page.evaluate(() => {
        const sheets = [...document.querySelectorAll(".resume-scale .sheet")];
        const clipped = sheets.map((el) => ({
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          clippedV: el.scrollHeight > el.clientHeight + 2,
          clippedH: el.scrollWidth > el.clientWidth + 2,
        }));
        const bodyText = document.body.innerText ?? "";
        const pills = [...document.querySelectorAll(".resume-sidebar a.sidebar-link")].map((a) => a.getAttribute("href"));
        return { sheets: sheets.length, clipped, textLen: bodyText.length, sample: bodyText.slice(0, 200), pills, bodyText };
      });
      if (check.sheets !== 1) failures.push(`${role}/${language}: expected 1 .sheet section, found ${check.sheets}`);
      for (const [i, c] of check.clipped.entries()) {
        if (c.clippedV || c.clippedH) failures.push(`${role}/${language}: sheet ${i + 1} clipped (v:${c.clippedV} ${c.scrollH}>${c.clientH}, h:${c.clippedH} ${c.scrollW}>${c.clientW})`);
      }
      if (!check.pills.some((h) => h && h.includes("/resume/"))) failures.push(`${role}/${language}: selector links missing`);
      const wantName = language === "zh" ? "宫健" : "Gong Jian";
      if (!check.bodyText.includes(wantName)) failures.push(`${role}/${language}: name missing from rendered text`);
      await page.pdf({ path: outFile, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
      const stat = statSync(outFile);
      const pages = countPdfPages(await readFile(outFile));
      console.log(`${fileName}: ${(stat.size / 1024).toFixed(0)} KB, ${pages} pages, sheets=${check.sheets}`);
      if (stat.size > MAX_BYTES) failures.push(`${fileName}: ${(stat.size / 1024 / 1024).toFixed(2)} MB exceeds 2 MB limit`);
      if (pages !== 1) failures.push(`${fileName}: expected 1 PDF page, got ${pages}`);
    } catch (err) {
      failures.push(`${role}/${language}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error("\nPDF verification failed:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\nAll ${combos.length} CV PDFs written to dist/resume/pdfs/`);
