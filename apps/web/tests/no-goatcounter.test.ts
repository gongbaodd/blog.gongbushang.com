import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// GON-239: GoatCounter was dropped (Mixpanel, opt-in, replaces it). No analytics may load
// outside the consent-gated Mixpanel path, so neither source nor built pages may reference it.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FORBIDDEN = /goatcounter|gc\.zgo\.at/i;
const BUILT_FORBIDDEN = /gc\.zgo\.at|data-goatcounter/i;
const TEXT = new Set([".astro", ".ts", ".tsx", ".js", ".mjs", ".css"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

describe("GoatCounter is not loaded by apps/web", () => {
  it("source has no GoatCounter reference", () => {
    const hits: string[] = [];
    for (const f of walk(join(root, "src"))) {
      if (!TEXT.has(extname(f)) || f.endsWith(".test.ts")) continue;
      if (SOURCE_FORBIDDEN.test(readFileSync(f, "utf8"))) hits.push(f.slice(root.length + 1));
    }
    expect(hits).toEqual([]);
  });

  it("wrangler config has no GoatCounter host", () => {
    expect(SOURCE_FORBIDDEN.test(readFileSync(join(root, "wrangler.jsonc"), "utf8"))).toBe(false);
  });

  // Built pages only: the legacy "goatcounter" post slug/JSON legitimately appears in content.
  const client = join(root, "dist", "client");
  it.skipIf(!existsSync(client))("built HTML has no GoatCounter script", () => {
    const hits: string[] = [];
    for (const f of walk(client)) {
      if (extname(f) !== ".html") continue;
      if (BUILT_FORBIDDEN.test(readFileSync(f, "utf8"))) hits.push(f.slice(client.length + 1));
    }
    expect(hits).toEqual([]);
  });
});
