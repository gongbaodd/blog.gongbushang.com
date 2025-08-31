/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { DataEntryMap } from "astro:content";

interface ImportMetaEnv {
  BLOG_SOURCE: keyof DataEntryMap;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
