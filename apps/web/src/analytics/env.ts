/**
 * Env gate shared by analytics and ads (PORT-7). Both run only on a production build:
 * `PUBLIC_SITE_ENV` is baked in by astro.config.mjs from SITE_ENV (same switch as noindex/robots.txt;
 * fails closed: anything but "production" is off).
 */
export function isProductionBuild(): boolean {
  return String(import.meta.env.PUBLIC_SITE_ENV ?? "") === "production";
}

/** Mixpanel loads only with a token on a production build. */
export function isAnalyticsConfigured(): boolean {
  return isProductionBuild() && String(import.meta.env.PUBLIC_MIXPANEL_TOKEN ?? "").trim() !== "";
}
