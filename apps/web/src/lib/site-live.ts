/**
 * The one fail-closed "is this site live?" flag (INF-10). Only the exact string `true` makes the site indexable and enables
 * analytics and ads. Unset, empty, `false`, `TRUE`, ` true`, `1` and typos are all NOT live: noindex + disallow-all robots.txt,
 * analytics and ads off.
 *
 * It is deliberately independent of SITE_ENV (which only picks the rebuild-on-publish target and the admin gates): the
 * production Worker is deployed during the soak, before CUT-1, and must stay hidden from search engines.
 *
 * One switch, read in two places: the build (`PUBLIC_SITE_LIVE` in the build environment, from the GitHub `production` environment
 * variable; astro.config.mjs bakes it into the static HTML and robots.txt, scripts/post-build.mjs decides on the `_headers` noindex
 * rule) and the Worker (the `PUBLIC_SITE_LIVE` var, which web-deploy.yml sets from the same variable with `--var`; wrangler.jsonc
 * keeps "false" as the default). Either side alone being not-live only ever adds noindex.
 */
export const SITE_LIVE_VAR = "PUBLIC_SITE_LIVE";

export function isSiteLive(value: unknown): boolean {
  return value === "true";
}
