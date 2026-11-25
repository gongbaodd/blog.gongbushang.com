/**
 * Typed taxonomy of custom analytics events (see docs/plan/mixpanel-analytics-plan.md §3).
 * The page view (`$mp_web_page_view`) is tracked automatically by Mixpanel and is intentionally absent.
 * Names follow Mixpanel convention: `object_verb` snake_case events, snake_case
 * properties, no `$`/`mp_` prefixes, no dynamic event names.
 */
export interface AnalyticsEventMap {
  "post_read": {
    slug: string;
    category: string;
    year: number | string;
    depth: 25 | 50 | 75 | 100;
    reading_time_min?: number;
    tags?: string[];
  };
  "search_opened": { source: "button" | "hotkey" };
  "search_performed": {
    query: string;
    query_length: number;
    result_count: number;
  };
  "search_result_clicked": { rank: number; slug: string; query?: string };
  "outbound_link_clicked": { domain: string; url: string; from_path: string };
  "tag_clicked": { tag: string; location: string };
  "podcast_listen_clicked": { episode: string; provider: string };
  "city_opened": { city: string };
  "related_post_clicked": { from_slug: string; to_slug: string; rank: number };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
