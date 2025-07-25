import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeExternalLinks from "rehype-external-links";

import {bundledLanguages } from "shiki"
import plantumlGrammar from "shiki-plantuml"

import vercel from '@astrojs/vercel';

export default defineConfig({
  site: "https://growgen.xyz",
  integrations: [
    mdx(),
    sitemap(),
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      [rehypeKatex, { strict: false }],
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer", "nofollow"] },
      ],
    ],
    shikiConfig: {
      langAlias: {
        "C": "c",
        "plantuml": "PlantUML"
      },
      langs: [
        ...Object.values(bundledLanguages),
        plantumlGrammar,
      ]
    }
  },
  output: "static",
  adapter: vercel({
    isr: true,
  }),
});
