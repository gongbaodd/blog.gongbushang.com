import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: 'https://growgen.xyz',
  integrations: [mdx(), sitemap(), react()],
  title: "宫不上的博客"
});