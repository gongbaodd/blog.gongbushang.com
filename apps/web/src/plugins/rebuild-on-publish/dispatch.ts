/** Pure request builder and sender for the GitHub repository_dispatch call (D9). */

export interface DispatchEnv {
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_DISPATCH_REPO?: string; // "owner/repo"
  GITHUB_API_URL?: string; // default https://api.github.com
  SITE_ENV?: string; // wrangler var: testing | production (anything else: no dispatch)
}

export type DeployEnvironment = "testing" | "production";

/**
 * Only an exact "testing" or "production" is dispatched. Anything else (unset, "local", typos) returns null and no rebuild is
 * triggered: a dev/admin session must never rebuild a real environment, and guessing "testing" would hide a misconfigured Worker.
 */
export function resolveEnvironment(siteEnv: string | undefined): DeployEnvironment | null {
  const v = siteEnv?.trim();
  return v === "testing" || v === "production" ? v : null;
}

export interface PublishInfo {
  collection: string;
  id: string;
  slug?: string;
}

export const DEFAULT_GITHUB_API_URL = "https://api.github.com";

/** Returns null when the token, repo or a valid SITE_ENV (testing|production) is not configured. */
export function buildDispatchRequest(
  env: DispatchEnv,
  info: PublishInfo,
): { url: string; init: RequestInit } | null {
  const token = env.GITHUB_DISPATCH_TOKEN;
  const repo = env.GITHUB_DISPATCH_REPO;
  if (!token || !repo || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo)) return null;
  const environment = resolveEnvironment(env.SITE_ENV);
  if (!environment) return null;
  const base = (env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL).replace(/\/+$/, "");
  return {
    url: `${base}/repos/${repo}/dispatches`,
    init: {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "emdash-rebuild-on-publish",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "emdash-publish",
        client_payload: { environment, collection: info.collection, id: info.id, slug: info.slug },
      }),
    },
  };
}

export interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/** Never throws. Logs outcome; token is never logged. */
export async function dispatchOnPublish(
  env: DispatchEnv,
  info: PublishInfo,
  log: Logger,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const req = buildDispatchRequest(env, info);
  if (!req) {
    log.info(
      "rebuild-on-publish: GITHUB_DISPATCH_TOKEN, GITHUB_DISPATCH_REPO or SITE_ENV (testing|production) not set, skipping",
    );
    return;
  }
  try {
    const res = await fetchImpl(req.url, req.init);
    if (res.status === 204)
      log.info(`rebuild-on-publish: dispatched for ${info.collection}/${info.slug ?? info.id}`);
    else
      log.error(
        `rebuild-on-publish: GitHub responded ${res.status}`,
        await res.text().catch(() => ""),
      );
  } catch (err) {
    log.error(
      "rebuild-on-publish: dispatch failed",
      err instanceof Error ? err.message : String(err),
    );
  }
}
