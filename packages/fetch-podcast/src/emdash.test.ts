import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "./cli.ts";
import { channelDrift, episodeToFields, upsertEpisodesIntoEmdash } from "./emdash.ts";
import { createClient } from "../../../apps/web/scripts/import/mig3/rest.mjs";
import { PODCAST_CHANNEL } from "../../../apps/web/src/lib/podcast-channel.ts";
import type { Episode } from "./types.ts";

const episode = (over: Partial<Episode> = {}): Episode => ({
  id: "--e2iv0jd",
  title: "T",
  link: "https://x/y",
  pubDate: "Sun, 28 Apr 2024 07:30:00 GMT",
  description: "<p>d</p>",
  summary: "d",
  duration: "00:12:31",
  audioUrl: "https://a",
  image: "https://i",
  ...over,
});

describe("fetch-podcast --emdash", () => {
  it("maps an episode to the podcasts collection fields (ISO pub_date)", () => {
    const f = episodeToFields(episode());
    expect(f).toMatchObject({ legacy_id: "--e2iv0jd", pub_date: "2024-04-28T07:30:00.000Z", audio_url: "https://a", image_url: "https://i" });
    expect(f).not.toHaveProperty("color_set");
  });

  it("never writes a null pub_date", () => {
    expect(episodeToFields(episode({ pubDate: "garbage" }))).not.toHaveProperty("pub_date");
  });

  it("parses --emdash and --dry-run; the legacy path stays the default", () => {
    expect(parseCliArgs(["--emdash", "http://127.0.0.1:4322", "--dry-run"])).toEqual({ emdash: "http://127.0.0.1:4322", dryRun: true });
    expect(parseCliArgs([]).emdash).toBeUndefined();
  });

  it("skips and warns on an unparseable RSS date, and creates the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const api = vi.fn(async () => ({ item: { id: "n1" } }));
    const client = { api, listByLegacyId: async () => ({ byLegacy: new Map([["old", { id: "o" }]]), dupes: [] }) } as never;
    const r = await upsertEpisodesIntoEmdash([episode({ id: "old" }), episode({ id: "bad", pubDate: "nope" }), episode({ id: "new" })], { url: "https://x" }, { client });
    expect(r).toEqual({ created: ["new"], existing: 1, skipped: ["bad"] });
    expect(api.mock.calls.map((c: unknown[]) => `${c[0]} ${c[1]}`)).toEqual(["POST /content/podcasts", "POST /content/podcasts/n1/publish"]);
    expect(warn.mock.calls[0]![0]).toContain("does not parse");
    vi.restoreAllMocks();
  });

  describe("credentials only over https or localhost", () => {
    beforeEach(() => {
      vi.stubEnv("EMDASH_TOKEN", "");
      vi.stubEnv("EMDASH_HEADERS", "");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("refuses a token for an http URL on a remote host", () => {
      expect(() => createClient({ url: "http://cms.example.com", token: "secret" })).toThrow(/non-https/);
    });
    it("refuses EMDASH_TOKEN from the environment too", () => {
      vi.stubEnv("EMDASH_TOKEN", "secret");
      expect(() => createClient({ url: "http://cms.example.com" })).toThrow(/non-https/);
    });
    it("refuses Access service-token headers over http", () => {
      vi.stubEnv("EMDASH_HEADERS", "CF-Access-Client-Id: x");
      expect(() => createClient({ url: "http://cms.example.com" })).toThrow(/non-https/);
    });
    it("rejects userinfo URLs that only look local", () => {
      for (const url of ["http://localhost:80@evil.com", "http://127.0.0.1:x@evil.com/", "http://[::1]:a@evil.com", "https://user:pw@cms.example.com"]) {
        expect(() => createClient({ url, token: "s" }), url).toThrow();
      }
    });
    it("rejects a hostname that merely starts with localhost", () => {
      expect(() => createClient({ url: "http://localhost.evil.com", token: "s" })).toThrow(/non-https/);
    });
    it("allows https, localhost and 127.0.0.1", () => {
      expect(() => createClient({ url: "https://cms.example.com", token: "s" })).not.toThrow();
      expect(() => createClient({ url: "http://localhost:4322", token: "s" })).not.toThrow();
      expect(() => createClient({ url: "http://127.0.0.1:4322", token: "s" })).not.toThrow();
    });
  });

  describe("channel drift", () => {
    const same = { title: PODCAST_CHANNEL.title, description: PODCAST_CHANNEL.description, image: PODCAST_CHANNEL.image };
    it("is silent when the RSS channel matches the site constant", () => {
      expect(channelDrift(same)).toEqual([]);
    });
    it("warns per differing field", () => {
      const w = channelDrift({ ...same, title: "New name", image: "https://other/i.jpg" });
      expect(w).toHaveLength(2);
      expect(w[0]).toContain("title");
      expect(w[1]).toContain("image");
    });
  });
});
