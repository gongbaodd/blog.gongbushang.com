// Lists built pages whose visible text is under a threshold.
// Usage: node scripts/audit-thin-pages.mjs [distDir] [minChars]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dist = process.argv[2] ?? "dist";
const min = Number(process.argv[3] ?? 50);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
  });
}

const visibleText = (html) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const byRoute = {};
const thin = [];
for (const file of walk(dist)) {
  const url = "/" + relative(dist, file).replace(/index\.html$/, "");
  const route = url.split("/")[1] || "(root)";
  const len = visibleText(readFileSync(file, "utf8")).length;
  byRoute[route] ??= { total: 0, thin: 0 };
  byRoute[route].total++;
  if (len < min) {
    byRoute[route].thin++;
    thin.push(`${len}\t${url}`);
  }
}
console.log(thin.join("\n"));
console.table(byRoute);
console.log(`thin pages (<${min} chars): ${thin.length}`);
