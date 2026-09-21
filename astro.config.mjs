import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import remarkMath from "remark-math";
import remarkAttributes from "remark-attributes";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";
import { rehypeCloudinary } from "./packages/utils/cloudinary.ts";

import { bundledLanguages } from "shiki";
import plantumlGrammar from "shiki-plantuml";
import mermaid from "astro-mermaid";

import fs from "node:fs";
import path from "node:path";
import glsl from "vite-plugin-glsl";

/**
 * Mantine components emit the same responsive utility CSS (e.g. the
 * `mantine-visible-from-*` media queries) once per island. With many nested
 * islands this duplicates identical <style> blocks across the HTML payload.
 * This integration removes exact duplicates (first occurrence wins), which
 * is always cascade-safe.
 */
function dedupeInlineStyles() {
  return {
    name: "dedupe-inline-styles",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const htmlFiles = [];
        const walk = async (current) => {
          for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
            const filePath = path.join(current, entry.name);
            if (entry.isDirectory()) await walk(filePath);
            else if (entry.name.endsWith(".html")) htmlFiles.push(filePath);
          }
        };
        await walk(fs.realpathSync(dir.pathname));

        let removed = 0;
        for (const file of htmlFiles) {
          const original = await fs.promises.readFile(file, "utf-8");
          const seen = new Set();
          const html = original.replace(
            /<style[^>]*>([\s\S]*?)<\/style>/g,
            (match, inner) => {
              const key = inner.trim();
              // Keep tiny blocks untouched; only drop exact duplicates.
              if (key.length > 40 && seen.has(key)) {
                removed += 1;
                return "";
              }
              seen.add(key);
              return match;
            },
          );
          if (html !== original) await fs.promises.writeFile(file, html);
        }
        if (removed > 0) {
          logger.info(`Removed ${removed} duplicate inline <style> blocks`);
        }
      },
    },
  };
}

export default defineConfig({
  site: "https://growgen.xyz",
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    mdx({
      extendMarkdownConfig: true,
    }),
    sitemap(),
    react(),
    mermaid({
      theme: "default",
      autoTheme: true,
    }),
    dedupeInlineStyles(),
  ],
  markdown: {
    // Astro 7 defaults to the Sätteri processor; this project depends on
    // unified remark/rehype plugins, so restore the unified pipeline
    // explicitly (Astro 7 no longer installs @astrojs/markdown-remark by
    // default — it is a direct dependency in package.json).
    processor: unified({
      remarkPlugins: [remarkAttributes, remarkMath],
      rehypePlugins: [
        rehypeCloudinary,
        [rehypeKatex, { strict: false }],
        [
          rehypeExternalLinks,
          { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] },
        ],
      ],
    }),
    shikiConfig: {
      langAlias: {
        C: "c",
        plantuml: "PlantUML",
      },
      langs: [...Object.values(bundledLanguages), plantumlGrammar],
    },
  },
  output: "static",
  vite: {
    plugins: [glsl()],
    optimizeDeps: {
      include: ["react-plock"], // prebundle it
      exclude: [
        "onnxruntime-node",
        "@dimforge/rapier3d-compat",
        "@react-three/rapier",
      ],
    },
    build: {
      rollupOptions: {
        // Keep all side effects (incl. Rapier WASM init) while still allowing
        // unused-export elimination. The previous `treeshake: false` disabled
        // tree-shaking globally, which shipped entire icon libraries
        // (tabler-icons-react ~2.2 MB, lucide-react ~470 MB uncompressed).
        treeshake: {
          moduleSideEffects: "no-external",
        },
      },
    },
    ssr: {
      noExternal: ["react-plock"], // force SSR build to bundle as CJS
    },
    resolve: {
      alias: {
        "react-plock": path.resolve(
          import.meta.dirname,
          "node_modules/react-plock/dist/index.es.js",
        ),
        "onnxruntime-node": path.resolve(import.meta.dirname, "src/empty-module.js"),
      },
    },
  },
});
