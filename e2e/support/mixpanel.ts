// Helpers for asserting on Mixpanel traffic without touching the real network.
// All Mixpanel requests are intercepted with page.route and fulfilled with
// `{"status":1}`; every request is recorded so scenarios can assert on it.
import zlib from "node:zlib";
import type { Page, Request } from "playwright";

/** Fake ingestion host baked into the analytics-on build (PUBLIC_MIXPANEL_API_HOST). */
export const MIXPANEL_E2E_HOST_PATH = "/__mp";
export const CONSENT_KEY = "growgen_analytics_consent";

export interface MixpanelEvent {
  event: string;
  properties: Record<string, unknown>;
}

export interface MixpanelCall {
  url: string;
  /** "track" | "engage" | "groups" | "other" (from the URL path). */
  endpoint: string;
  events: MixpanelEvent[];
  /** Decoded engage/people payload items (non-event objects). */
  records: unknown[];
}

export class MixpanelRecorder {
  /** Every request to a *mixpanel.com* host or to the fake e2e host path. */
  readonly calls: MixpanelCall[] = [];
  /** Hostnames containing "mixpanel.com" (or mxpnl) seen at all. */
  readonly mixpanelDotComRequests: string[] = [];

  async attach(page: Page): Promise<void> {
    page.on("request", (req) => {
      const host = safeUrl(req.url())?.hostname ?? "";
      if (/mixpanel\.com$|mxpnl\.com$/i.test(host)) this.mixpanelDotComRequests.push(req.url());
    });
    // Real hosts: never hit the network, whatever the build's host is.
    await page.route(/^https?:\/\/[^/]*(mixpanel\.com|mxpnl\.com)\//i, (route) => this.handle(route));
    await page.route(`**${MIXPANEL_E2E_HOST_PATH}/**`, (route) => this.handle(route));
  }

  private async handle(route: import("playwright").Route): Promise<void> {
    const req = route.request();
    if (req.method() !== "OPTIONS") this.calls.push(decodeCall(req));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
      body: '{"status":1}',
    });
  }

  tracked(endpoint?: string): MixpanelCall[] {
    return this.calls.filter((c) => c.endpoint === (endpoint ?? c.endpoint));
  }

  /** Calls that would send data: /track or /engage. */
  dataCalls(): MixpanelCall[] {
    return this.calls.filter((c) => c.endpoint === "track" || c.endpoint === "engage");
  }

  events(name?: string): MixpanelEvent[] {
    return this.calls.flatMap((c) => c.events).filter((e) => !name || e.event === name);
  }
}

function safeUrl(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function decodeCall(req: Request): MixpanelCall {
  const url = safeUrl(req.url());
  const seg = url?.pathname.split("/").filter(Boolean).pop() ?? "";
  const endpoint = ["track", "engage", "groups"].includes(seg) ? seg : "other";
  const items: unknown[] = [];

  const sources: string[] = [];
  const dataParam = url?.searchParams.get("data");
  if (dataParam) sources.push(dataParam);

  const buf = req.postDataBuffer();
  if (buf && buf.length) {
    let text: string;
    try {
      // Mixpanel may gzip the body (compress=1).
      text = (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString("utf8");
    } catch {
      text = buf.toString("utf8");
    }
    if (/^data=/.test(text) || text.includes("&data=")) {
      const params = new URLSearchParams(text);
      const d = params.get("data");
      if (d) sources.push(d);
    } else {
      sources.push(text);
    }
  }
  for (const s of sources) items.push(...parsePayload(s));

  const events: MixpanelEvent[] = [];
  const records: unknown[] = [];
  for (const it of items) {
    if (it && typeof it === "object" && typeof (it as MixpanelEvent).event === "string") {
      events.push(it as MixpanelEvent);
    } else records.push(it);
  }
  return { url: req.url(), endpoint, events, records };
}

/** Accepts raw JSON, base64(JSON), single objects or arrays. */
function parsePayload(raw: string): unknown[] {
  const tryJson = (s: string): unknown[] | null => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : [v];
    } catch {
      return null;
    }
  };
  const trimmed = raw.trim();
  const direct = tryJson(trimmed);
  if (direct) return direct;
  try {
    const decoded = Buffer.from(trimmed.replace(/ /g, "+"), "base64");
    const text = (decoded[0] === 0x1f && decoded[1] === 0x8b ? zlib.gunzipSync(decoded) : decoded).toString("utf8");
    return tryJson(text) ?? [];
  } catch {
    return [];
  }
}
