import type { Config, Dict, Mixpanel } from "mixpanel-browser";
import type { AnalyticsEventMap, AnalyticsEventName } from "./events";
import { isAnalyticsConfigured } from "./env";

export type { AnalyticsEventMap, AnalyticsEventName } from "./events";

export type ConsentState = "granted" | "denied" | "unset";

const DEFAULT_API_HOST = "https://api-eu.mixpanel.com";
const MAX_QUEUE = 200;
const MAX_QUERY_LENGTH = 100;
/**
 * Our own record of the visitor's choice. Mixpanel's flag can't be used for
 * this: with `opt_out_tracking_by_default` it writes "opted out" on first
 * init, which would make a visitor who never answered look like "denied".
 */
const CONSENT_KEY = "growgen_analytics_consent";

type Task = (mp: Mixpanel) => void;

let mixpanelRef: Mixpanel | null = null;
let loadPromise: Promise<void> | null = null;
let queue: Task[] = [];
let pendingConsent: ConsentState | null = null;

function getToken(): string {
  return String(import.meta.env.PUBLIC_MIXPANEL_TOKEN ?? "").trim();
}

function isEnabled(): boolean {
  return typeof window !== "undefined" && isAnalyticsConfigured();
}

/** Map a URL pathname to a coarse `site_section` value. */
export function siteSection(pathname: string): string {
  const first = (pathname || "/").split("/").filter(Boolean)[0]?.toLowerCase();
  if (!first) return "home";
  switch (first) {
    case "lab":
    case "world":
    case "podcast":
    case "series":
    case "year":
    case "about":
      return first;
    case "tag":
    case "tags":
      return "tag";
    case "resume":
    case "cv":
      return "resume";
    case "404":
    case "api":
    case "contact":
    case "gemini":
    case "hero":
    case "hero-gallery":
    case "privacy":
    case "sitemap":
    case "umap":
      return "other";
    default:
      return "blog";
  }
}

function sanitize(props: unknown): Dict {
  const out: Dict = { ...(props as Dict) };
  if (typeof out.query === "string") {
    out.query = out.query.trim().slice(0, MAX_QUERY_LENGTH);
  }
  // Mixpanel guidance: omit missing values instead of sending null / "".
  for (const [key, value] of Object.entries(out)) {
    if (value === null || value === undefined || value === "") delete out[key];
  }
  return out;
}

function superProperties(): Dict {
  const props: Dict = {
    site_section: siteSection(window.location.pathname),
    color_scheme:
      document.documentElement.dataset.mantineColorScheme === "light" ? "light" : "dark",
  };
  const sha = String(import.meta.env.PUBLIC_BUILD_SHA ?? "");
  if (sha) props.build_sha = sha;
  return props;
}

function enqueue(task: Task): void {
  if (mixpanelRef) {
    try {
      task(mixpanelRef);
    } catch {
      /* analytics must never break the page */
    }
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push(task);
}

/** Load mixpanel-browser (dynamic import) and flush queued calls. Idempotent. */
export function initAnalytics(): Promise<void> {
  if (!isEnabled()) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = import("mixpanel-browser")
    .then((mod) => {
      const mp = (mod.default ?? mod) as unknown as Mixpanel;
      const config: Partial<Config> = {
        api_host: import.meta.env.PUBLIC_MIXPANEL_API_HOST || DEFAULT_API_HOST,
        // Fired by hand below, after the stored consent has been applied to Mixpanel (see there).
        track_pageview: false,
        persistence: "localStorage",
        ip: false,
        ignore_dnt: false,
        autocapture: false,
        record_sessions_percent: 0,
        opt_out_tracking_by_default: true,
        debug: import.meta.env.PUBLIC_MIXPANEL_DEBUG === "true",
      };
      mp.init(getToken(), config);
      // Make Mixpanel's own opt-in flag follow OUR stored choice before anything is sent. Mixpanel
      // persists its flag across page loads and `opt_out_tracking_by_default` only applies when it
      // is not already opted in, so a flag left over from an earlier "Allow" would keep sending after
      // a "No thanks" whose opt_out call never ran (the visitor left the page before this module
      // loaded). That is why it is checked on every load, not only when the flag is missing.
      const stored = readStoredConsent();
      const mpOptedIn = mp.has_opted_in_tracking();
      if (stored === "granted") {
        if (!mpOptedIn) mp.opt_in_tracking();
      } else if (mpOptedIn) {
        mp.opt_out_tracking({ delete_user: false });
      }
      mp.register(superProperties());
      // The page view `track_pageview: true` used to give: only a returning, already-opted-in
      // visitor (a first "Allow" records it in optIn()).
      // Fires whenever the stored choice is "granted" after the sync above, including when Mixpanel's
      // own flag had been cleared and was just restored (a flag-less returning visitor).
      if (stored === "granted") mp.track_pageview();
      mixpanelRef = mp;
      const tasks = queue;
      queue = [];
      for (const task of tasks) {
        try {
          task(mp);
        } catch {
          /* ignore */
        }
      }
    })
    .catch(() => {
      // Blocked or failed load: stay silent and drop queued work.
      queue = [];
    });
  return loadPromise;
}

/** Track a typed custom event. No-op without a token, on the server, or without consent. */
export function track<N extends AnalyticsEventName>(name: N, props: AnalyticsEventMap[N]): void {
  if (!isEnabled()) return;
  const clean = sanitize(props);
  enqueue((mp) => {
    // Mixpanel itself drops events while the visitor has not opted in.
    mp.track(name, clean);
  });
}

/** Visitor allows analytics. Also records the current page view. */
export function optIn(): void {
  if (!isEnabled()) return;
  pendingConsent = "granted";
  writeStoredConsent("granted");
  void initAnalytics();
  enqueue((mp) => {
    // Already opted in (a repeat click on /privacy/, or a click before init where initAnalytics()
    // just synced the flag and sent the page view): do not send a second `$opt_in` / page view.
    if (mp.has_opted_in_tracking()) return;
    mp.opt_in_tracking();
    // Initial page view was skipped while opted out; send it once now.
    mp.register(superProperties());
    mp.track_pageview();
  });
}

/** Visitor declines analytics. Clears Mixpanel's stored data. */
export function optOut(): void {
  if (!isEnabled()) return;
  pendingConsent = "denied";
  writeStoredConsent("denied");
  void initAnalytics();
  enqueue((mp) => {
    mp.opt_out_tracking({ delete_user: false });
  });
}

function readStoredConsent(): ConsentState {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch {
    /* storage unavailable */
  }
  return "unset";
}

function writeStoredConsent(value: Exclude<ConsentState, "unset">): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage unavailable: choice lasts for this page only */
  }
}

/** Current consent: the visitor's explicit choice, or "unset" if they never answered. */
export function getConsent(): ConsentState {
  if (!isEnabled()) return "unset";
  return pendingConsent ?? readStoredConsent();
}

/** Test helper: reset module state. */
export function __resetAnalyticsForTests(): void {
  mixpanelRef = null;
  loadPromise = null;
  queue = [];
  pendingConsent = null;
}
