import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

import remarkMath from "remark-math";
import remarkAttributes from "remark-attributes";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";

import { bundledLanguages } from "shiki";
import plantumlGrammar from "shiki-plantuml";
import mermaid from "astro-mermaid";

import vercel from "@astrojs/vercel";
import path from "node:path";

export default defineConfig({
  site: "https://growgen.xyz",
  integrations: [
    mdx({
      extendMarkdownConfig: true,
    }),
    sitemap(),
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    mermaid({
      theme: "default",
      autoTheme: true,
    }),
  ],
  markdown: {
    remarkPlugins: [remarkAttributes, remarkMath],
    rehypePlugins: [
      [rehypeKatex, { strict: false }],
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] },
      ],
    ],
    shikiConfig: {
      langAlias: {
        C: "c",
        plantuml: "PlantUML",
      },
      langs: [...Object.values(bundledLanguages), plantumlGrammar],
    },
  },
  output: "static",
  adapter: vercel({
    isr: true,
  }),
  vite: {
    optimizeDeps: {
      include: ["react-plock"], // prebundle it
      exclude: ["onnxruntime-node", "sharp"],
    },
    ssr: {
      noExternal: ["react-plock"], // force SSR build to bundle as CJS
    },
    resolve: {
      alias: {
        "onnxruntime-node": path.resolve(import.meta.dirname, "src/empty-module.js"),
        sharp: path.resolve(import.meta.dirname, "src/empty-module.js"),
      },
    },
  },
});
