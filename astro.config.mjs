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

import path from "node:path";
import glsl from "vite-plugin-glsl";

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
    sitemap({
      // Unfinished/duplicate pages and thin list pages stay out of the sitemap.
      filter: (page) =>
        !/\/(cv|gemini|umap|hero|hero-gallery|privacy)\/?$/.test(page) &&
        !/\/hero\//.test(page) &&
        !/\/tag\//.test(page) &&
        !/\/world\//.test(page) &&
        !/\/series\//.test(page),
    }),
    react(),
    mermaid({
      theme: "default",
      autoTheme: true,
    }),
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
        [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] }],
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
      exclude: ["onnxruntime-node", "@dimforge/rapier3d-compat", "@react-three/rapier"],
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
