// Social links come from the EmDash menu "social": label, url, icon key (`cssClasses`) and
// sort order (menu order). Falls back to seed/social-links.json when the menu is missing,
// empty or unreadable. Build-time only.
import { getMenu } from "emdash";
import fallback from "../../seed/social-links.json";

export interface SocialLink {
  label: string;
  url: string;
  icon: string;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

interface MenuLike {
  items?: Array<{ label?: string; url?: string; cssClasses?: string }>;
}

export function normalizeSocialLinks(menu: MenuLike | null | undefined): SocialLink[] {
  const out: SocialLink[] = [];
  for (const it of menu?.items ?? []) {
    const label = it.label?.trim();
    const url = it.url?.trim();
    if (!label || !url || !SAFE_URL.test(url)) continue;
    out.push({ label, url, icon: (it.cssClasses ?? "").trim().toLowerCase() });
  }
  return out;
}

export function fallbackSocialLinks(): SocialLink[] {
  return [...fallback]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ label, url, icon }) => ({ label, url, icon }));
}

async function loadSocialLinks(): Promise<SocialLink[]> {
  try {
    const links = normalizeSocialLinks(await getMenu("social"));
    if (links.length) return links;
  } catch {
    // fall through to the fallback list
  }
  return fallbackSocialLinks();
}

// Footer and Follow render on every prerendered page. Query the menu once per build,
// not once per page: a DB round-trip per page pushed the build past the CI timeout (GON-251).
let cached: Promise<SocialLink[]> | undefined;

export function getSocialLinks(): Promise<SocialLink[]> {
  cached ??= loadSocialLinks();
  return cached;
}

/** Test hook: forget the cached menu. */
export function resetSocialLinksCache(): void {
  cached = undefined;
}
