import { track } from "@/src/analytics";

/**
 * Delegated click handler logic for the related-posts panel: one handler for all cards;
 * rank is the 1-based index in the related list.
 */
export function trackRelatedClick(
  target: EventTarget | null,
  fromId: string,
  relates: { id: string; href: string }[],
) {
  const href = (target as Element | null)?.closest?.("a[href]")?.getAttribute("href");
  if (!href) return;
  const idx = relates.findIndex((p) => p.href === href);
  if (idx < 0) return;
  track("related_post_clicked", { from_slug: fromId, to_slug: relates[idx].id, rank: idx + 1 });
}
