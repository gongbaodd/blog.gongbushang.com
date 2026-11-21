import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = vi.fn();
const mp = {
  init: vi.fn(),
  register: vi.fn(),
  track: vi.fn(),
  track_pageview: vi.fn(),
  opt_in_tracking: vi.fn(),
  opt_out_tracking: vi.fn(),
  has_opted_in_tracking: vi.fn(() => false),
  has_opted_out_tracking: vi.fn(() => false),
};

vi.mock("mixpanel-browser", () => {
  loaded();
  return { default: mp };
});

async function load() {
  return import("./index");
}

const store = new Map<string, string>();

describe("analytics", () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      location: { pathname: "/lab", host: "x" },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    vi.stubGlobal("document", { documentElement: { dataset: {} } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is a silent no-op without a token", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "");
    const a = await load();
    await a.initAnalytics();
    expect(() => {
      a.track("search_opened", { source: "button" });
      a.optIn();
      a.optOut();
    }).not.toThrow();
    expect(a.getConsent()).toBe("unset");
    expect(loaded).not.toHaveBeenCalled();
    expect(mp.init).not.toHaveBeenCalled();
  });

  it("is a no-op on the server", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);
    const a = await load();
    await a.initAnalytics();
    a.track("search_opened", { source: "hotkey" });
    expect(mp.init).not.toHaveBeenCalled();
  });

  it("flushes queued calls in order and inits once", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    const a = await load();
    a.track("city_opened", { city: "A" });
    a.track("city_opened", { city: "B" });
    await Promise.all([a.initAnalytics(), a.initAnalytics()]);
    a.track("city_opened", { city: "C" });
    expect(mp.init).toHaveBeenCalledTimes(1);
    expect(mp.init.mock.calls[0][1]).toMatchObject({
      api_host: "https://api-eu.mixpanel.com",
      opt_out_tracking_by_default: true,
      ip: false,
      autocapture: false,
    });
    expect(mp.track.mock.calls.map((c) => c[1].city)).toEqual(["A", "B", "C"]);
  });

  it("opt in/out call mixpanel and update consent", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    const a = await load();
    expect(a.getConsent()).toBe("unset");
    a.optIn();
    expect(a.getConsent()).toBe("granted");
    await a.initAnalytics();
    expect(mp.opt_in_tracking).toHaveBeenCalled();
    expect(mp.track_pageview).toHaveBeenCalledTimes(1);
    a.optOut();
    expect(mp.opt_out_tracking).toHaveBeenCalledWith({ delete_user: false });
    expect(a.getConsent()).toBe("denied");
  });

  it("relies on mixpanel to drop events when opted out", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    const a = await load();
    await a.initAnalytics();
    a.track("tag_clicked", { tag: "x", location: "y" });
    // Mixpanel handles the opt-out gate; we only forward the call.
    expect(mp.track).toHaveBeenCalledWith("tag_clicked", { tag: "x", location: "y" });
  });

  it("stays unset when only mixpanel's default opt-out flag exists", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    // What opt_out_tracking_by_default writes on first init.
    store.set("__mp_opt_in_out_tok", "0");
    const a = await load();
    await a.initAnalytics();
    expect(a.getConsent()).toBe("unset");
  });

  it("remembers the choice across page loads", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    (await load()).optIn();
    vi.resetModules();
    const a = await load();
    expect(a.getConsent()).toBe("granted");
    await a.initAnalytics();
    // mixpanel's own flag is missing → re-synced on init
    expect(mp.opt_in_tracking).toHaveBeenCalled();
  });

  it("trims and truncates query", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    const a = await load();
    await a.initAnalytics();
    a.track("search_performed", {
      query: "  " + "a".repeat(150) + "  ",
      query_length: 150,
      result_count: 0,
    });
    expect(mp.track.mock.calls[0][1].query).toBe("a".repeat(100));
  });

  it("omits null, undefined and empty-string properties", async () => {
    vi.stubEnv("PUBLIC_MIXPANEL_TOKEN", "tok");
    const a = await load();
    await a.initAnalytics();
    a.track("post_read", { slug: "s", category: "tech", year: "", depth: 25 });
    a.track("tag_clicked", { tag: "", location: "tag-cloud" });
    expect(mp.track.mock.calls[0][1]).toEqual({ slug: "s", category: "tech", depth: 25 });
    expect(mp.track.mock.calls[1][1]).toEqual({ location: "tag-cloud" });
  });

  it("maps siteSection", async () => {
    const { siteSection } = await load();
    expect(siteSection("/")).toBe("home");
    expect(siteSection("/lab")).toBe("lab");
    expect(siteSection("/tags")).toBe("tag");
    expect(siteSection("/tag/foo")).toBe("tag");
    expect(siteSection("/cv")).toBe("resume");
    expect(siteSection("/privacy")).toBe("other");
    expect(siteSection("/tech/2026/01/01/x")).toBe("blog");
  });
});
