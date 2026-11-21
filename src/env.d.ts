/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { DataEntryMap } from "astro:content";

interface ImportMetaEnv {
  BLOG_SOURCE: keyof DataEntryMap;
  PUBLIC_ADSENSE_SLOT_ID?: string;
  PUBLIC_ADSENSE_CONSENT_READY?: string;
  PUBLIC_MIXPANEL_TOKEN?: string;
  PUBLIC_MIXPANEL_API_HOST?: string;
  PUBLIC_MIXPANEL_DEBUG?: string;
  PUBLIC_BUILD_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
