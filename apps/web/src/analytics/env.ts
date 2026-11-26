import { isSiteLive } from "../lib/site-live";

/**
 * Env gate shared by analytics and ads (PORT-7). Both run only on a build whose `PUBLIC_SITE_LIVE` is exactly `true`
 * (baked in by astro.config.mjs; same switch as noindex/robots.txt; fails closed). SITE_ENV plays no part (INF-10).
 */
export function isLiveBuild(): boolean {
  return isSiteLive(import.meta.env.PUBLIC_SITE_LIVE);
}

/** Mixpanel loads only with a token on a live build. */
export function isAnalyticsConfigured(): boolean {
  return isLiveBuild() && String(import.meta.env.PUBLIC_MIXPANEL_TOKEN ?? "").trim() !== "";
}
