import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { postUrlDate } from "../../src/lib/post-id";
import {
  POSTS_URL_PATTERN,
  describeUrl,
  isLoopbackUrl,
  legacyDay,
  noonUtc,
  planAll,
  planPublishedAt,
  planUrlPattern,
  utcDay,
  validDay,
} from "./apply-post-urls.mjs";

const row = (over: Record<string, unknown> = {}) => ({
  id: "01ABC",
  slug: "2015-03-15-threejs",
  status: "published",
  legacy_id: "2015/03/15/threejs",
  legacy_date: "2015-03-15",
  published_at: "2026-11-24T15:14:44.405Z",
  ...over,
});

describe("apply-post-urls (GON-270)", () => {
  it("the url pattern is the one EmDash's View link and apply.mjs use", () => {
    expect(POSTS_URL_PATTERN).toBe("/{year}/{month}/{day}/{slug}");
    expect(planUrlPattern("/posts/{slug}")).toEqual({ action: "update", from: "/posts/{slug}", to: POSTS_URL_PATTERN });
    expect(planUrlPattern(null)).toEqual({ action: "update", from: null, to: POSTS_URL_PATTERN });
    expect(planUrlPattern(POSTS_URL_PATTERN)).toEqual({ action: "none" });
  });

  it("backfills an imported post whose published_at is the import time", () => {
    expect(planPublishedAt(row())).toEqual({ action: "update", from: "2026-11-24T15:14:44.405Z", to: "2015-03-15T12:00:00.000Z" });
  });

  it("is idempotent: the value it writes is left alone on the next run", () => {
    const written = planPublishedAt(row());
    if (written.action !== "update") throw new Error("expected an update");
    expect(planPublishedAt(row({ published_at: written.to }))).toEqual({ action: "none" });
    expect(planAll([row({ published_at: written.to })], POSTS_URL_PATTERN)).toMatchObject({ updates: [], unchanged: 1, pattern: { action: "none" } });
  });

  it("keeps a published_at that already falls on the legacy day (UTC), whatever the time", () => {
    expect(planPublishedAt(row({ published_at: "2015-03-15T00:00:00.000Z" }))).toEqual({ action: "none" });
    expect(planPublishedAt(row({ published_at: "2015-03-15T23:59:59.999Z" }))).toEqual({ action: "none" });
    expect(planPublishedAt(row({ published_at: "2015-03-14T23:59:59.999Z" })).action).toBe("update");
  });

  it("never touches a post created in the admin (no legacy_id)", () => {
    expect(planPublishedAt(row({ legacy_id: null }))).toEqual({ action: "skip", reason: "not imported (no legacy_id)" });
    expect(planPublishedAt(row({ legacy_id: "  " })).action).toBe("skip");
  });

  it("takes the day from legacy_id when legacy_date is missing or invalid, and skips when neither works", () => {
    expect(legacyDay({ legacy_id: "2016/10/29/x", legacy_date: null })).toBe("2016-10-29");
    expect(legacyDay({ legacy_id: "2016/10/29/x", legacy_date: "2016-13-40" })).toBe("2016-10-29");
    expect(legacyDay({ legacy_id: "bad", legacy_date: null })).toBeUndefined();
    expect(planPublishedAt(row({ legacy_id: "bad", legacy_date: "nope" }))).toEqual({ action: "skip", reason: "no usable legacy date" });
  });

  it("leaves an unpublished imported post without published_at alone", () => {
    expect(planPublishedAt(row({ status: "draft", published_at: null })).action).toBe("skip");
    expect(planPublishedAt(row({ status: "published", published_at: null })).action).toBe("update");
  });

  it("validDay rejects impossible dates", () => {
    expect(validDay("2024-02-29")).toBe("2024-02-29");
    expect(validDay("2023-02-29")).toBeUndefined();
    expect(validDay("2023-4-1")).toBeUndefined();
    expect(utcDay("2015-03-15T23:30:00+02:00")).toBe("2015-03-15");
    expect(utcDay("not a date")).toBeUndefined();
  });

  it("planAll counts updates, unchanged and skipped", () => {
    const plan = planAll([row(), row({ id: "2", published_at: "2015-03-15T12:00:00.000Z" }), row({ id: "3", legacy_id: null })], "/posts/{slug}");
    expect(plan.updates.map((u) => u.id)).toEqual(["01ABC"]);
    expect(plan.unchanged).toBe(1);
    expect(plan.skipped).toEqual([{ id: "3", slug: "2015-03-15-threejs", reason: "not imported (no legacy_id)" }]);
    expect(plan.pattern.action).toBe("update");
  });

  it("only a loopback host counts as local; describeUrl hides the credentials", () => {
    expect(isLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(isLoopbackUrl("postgresql://u:p@localhost:5432/db")).toBe(true);
    expect(isLoopbackUrl("postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres")).toBe(false);
    expect(isLoopbackUrl("postgresql://u:p@localhost.evil.example/db")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
    expect(describeUrl("postgresql://user:secret@db.example:5432/postgres")).toBe("db.example:5432/postgres");
  });
});

describe("timezone: noon UTC keeps the EmDash (UTC) and site (Europe/Tallinn) dates equal", () => {
  const urls = readFileSync(new URL("../../tests/legacy-urls.txt", import.meta.url), "utf8")
    .split("\n")
    .map((l) => /^\/[^/]+\/(\d{4})\/(\d{2})\/(\d{2})\/[^/]+\/$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m);

  it("for each of the 995 legacy post days (DST changes included)", () => {
    expect(urls.length).toBe(995);
    for (const m of urls) {
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      const stored = noonUtc(day);
      expect(utcDay(stored), day).toBe(day);
      expect(postUrlDate(stored), day).toBe(`${m[1]}/${m[2]}/${m[3]}`);
    }
  });

  it("documents the window where they differ for a new post: Tallinn is ahead of UTC by 2 or 3 hours", () => {
    // 22:30Z on 14 July is already 15 July in Tallinn (UTC+3): the site URL says 15, EmDash's View link says 14.
    expect(postUrlDate("2026-07-14T22:30:00Z")).toBe("2026/07/15");
    expect(utcDay("2026-07-14T22:30:00Z")).toBe("2026-07-14");
    // In winter (UTC+2) the window is 22:00Z-24:00Z.
    expect(postUrlDate("2026-12-14T22:30:00Z")).toBe("2026/12/15");
    expect(postUrlDate("2026-12-14T21:59:00Z")).toBe("2026/12/14");
  });
});
