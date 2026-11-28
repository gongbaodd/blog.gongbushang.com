#!/usr/bin/env node
/**
 * One-time data step for GON-270 (post URLs drop the category segment). Dry run by default.
 *
 *   DATABASE_URL=<postgres url> node apps/web/scripts/schema/apply-post-urls.mjs            # report what would change
 *   DATABASE_URL=<postgres url> node apps/web/scripts/schema/apply-post-urls.mjs --apply    # write it (one transaction)
 *   ... --database-url <url>   instead of the DATABASE_URL variable;   --yes-remote   needed with --apply on a non-loopback host
 *
 * It does two things on an existing EmDash database (a fresh one gets both from schema/apply.mjs and the import):
 *
 * 1. Sets the `posts` collection `url_pattern` to `/{year}/{month}/{day}/{slug}` (table `_emdash_collections`). The admin "View"
 *    link is built from it plus the entry's `published_at` (EmDash uses the UTC date) and `slug`.
 * 2. Backfills `published_at` of every imported post (one with a `legacy_id`) from its legacy date. MIG-1 stored the import time there,
 *    so the "View" link would otherwise carry the import date. The value is noon UTC of the legacy day: the UTC date (what EmDash
 *    reads) and the Europe/Tallinn date (what the site's URLs use, post-id.ts POST_URL_TZ) are then the same day for every date,
 *    whatever the DST offset. `content_taxonomies.published_at` (EmDash's denormalized copy used by category listings) is kept in step.
 *
 * It never touches `slug` (GON-271 decides whether the imported `YYYY-MM-DD-<slug>` slugs change), so until then the View link of an
 * imported post is `/<legacy date>/<YYYY-MM-DD-slug>` and does not resolve; the public URL is built from `legacy_id` and is unchanged.
 *
 * Idempotent: a post whose `published_at` already falls on its legacy day (UTC) is left alone, and a second run reports nothing to do.
 * A post without `legacy_id` (created in the admin) is never touched: its `published_at` is the real publish time.
 * After `--apply`, EmDash caches the pattern and entries in memory for up to 10 minutes: restart the admin or wait.
 * Never run it against production from an agent: the owner runs it (docs/plan/emdash/runbooks, GON-270).
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { pgClientConfig } from "../admin/pg-tls.mjs";

export const POSTS_URL_PATTERN = "/{year}/{month}/{day}/{slug}";

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_ID_RE = /^(\d{4})\/(\d{2})\/(\d{2})\/.+$/;

/** `YYYY-MM-DD` when it is a real calendar date, else undefined. */
export function validDay(s) {
  const m = typeof s === "string" ? ISO_DAY_RE.exec(s.trim()) : null;
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const same =
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3]);
  return same ? s.trim() : undefined;
}

/** The legacy day of an imported post: `legacy_date`, else the date part of `legacy_id`. undefined when neither is usable. */
export function legacyDay(row) {
  const fromDate = validDay(row.legacy_date);
  if (fromDate) return fromDate;
  const m = typeof row.legacy_id === "string" ? LEGACY_ID_RE.exec(row.legacy_id.trim()) : null;
  return m ? validDay(`${m[1]}-${m[2]}-${m[3]}`) : undefined;
}

/** The stored value: noon UTC of the day, in EmDash's ISO format. */
export const noonUtc = (day) => `${day}T12:00:00.000Z`;

/** UTC `YYYY-MM-DD` of a stored `published_at` (ISO text); undefined when missing or unparsable. */
export function utcDay(publishedAt) {
  if (!publishedAt) return undefined;
  const d = new Date(publishedAt);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * What to do with one `ec_posts` row. Pure.
 * - { action: "skip", reason } for a post without `legacy_id`, without a usable legacy day, or unpublished with no `published_at`
 * - { action: "none" } when `published_at` already falls on the legacy day (UTC)
 * - { action: "update", from, to }
 */
export function planPublishedAt(row) {
  if (typeof row.legacy_id !== "string" || !row.legacy_id.trim())
    return { action: "skip", reason: "not imported (no legacy_id)" };
  const day = legacyDay(row);
  if (!day) return { action: "skip", reason: "no usable legacy date" };
  if (row.status !== "published" && !row.published_at)
    return { action: "skip", reason: "unpublished, no published_at" };
  if (utcDay(row.published_at) === day) return { action: "none" };
  return { action: "update", from: row.published_at ?? null, to: noonUtc(day) };
}

/** `url_pattern` of the posts collection: update unless it already is the target. Pure. */
export function planUrlPattern(current) {
  return current === POSTS_URL_PATTERN
    ? { action: "none" }
    : { action: "update", from: current ?? null, to: POSTS_URL_PATTERN };
}

/** Plan for all rows plus a printable summary. Pure. */
export function planAll(rows, currentPattern) {
  const updates = [];
  const skipped = [];
  let unchanged = 0;
  for (const row of rows) {
    const p = planPublishedAt(row);
    if (p.action === "update")
      updates.push({
        id: row.id,
        slug: row.slug,
        legacy_id: row.legacy_id,
        from: p.from,
        to: p.to,
      });
    else if (p.action === "skip") skipped.push({ id: row.id, slug: row.slug, reason: p.reason });
    else unchanged += 1;
  }
  return { pattern: planUrlPattern(currentPattern), updates, skipped, unchanged };
}

export const isLoopbackUrl = (url) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
};

/** Host:port/db of a connection URL, never the credentials. */
export const describeUrl = (url) => {
  const u = new URL(url);
  return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
};

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => args.includes(n);
  const opt = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const url = opt("--database-url") ?? process.env.DATABASE_URL;
  const apply = flag("--apply");
  if (!url) {
    console.error(
      "Set DATABASE_URL (or pass --database-url). The script does not read .env files.",
    );
    process.exit(2);
  }
  const local = isLoopbackUrl(url);
  if (apply && !local && !flag("--yes-remote")) {
    console.error(
      `Refusing to write to a non-local database (${describeUrl(url)}). Pass --yes-remote to confirm.`,
    );
    process.exit(2);
  }

  const client = new pg.Client(pgClientConfig(url));
  await client.connect();
  console.log(`[post-urls] target ${describeUrl(url)} (${apply ? "APPLY" : "dry run"})`);
  try {
    await client.query(apply ? "begin" : "begin read only");
    const rows = (
      await client.query(
        "select id, slug, status, legacy_id, legacy_date, published_at from ec_posts where deleted_at is null",
      )
    ).rows;
    const current = (
      await client.query("select url_pattern from _emdash_collections where slug = 'posts'")
    ).rows[0];
    if (!current) throw new Error("no `posts` collection in _emdash_collections: wrong database?");
    const plan = planAll(rows, current.url_pattern);

    console.log(
      `[post-urls] url_pattern: ${plan.pattern.action === "none" ? `already ${POSTS_URL_PATTERN}` : `${plan.pattern.from ?? "(none)"} -> ${plan.pattern.to}`}`,
    );
    console.log(
      `[post-urls] published_at: ${plan.updates.length} to backfill, ${plan.unchanged} already on their legacy day, ${plan.skipped.length} skipped (of ${rows.length} posts)`,
    );
    for (const u of plan.updates.slice(0, 5)) console.log(`  ${u.legacy_id}: ${u.from} -> ${u.to}`);
    if (plan.updates.length > 5) console.log(`  ... and ${plan.updates.length - 5} more`);
    const reasons = new Map();
    for (const s of plan.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
    for (const [reason, n] of reasons) console.log(`  skipped ${n}: ${reason}`);

    if (!apply) {
      await client.query("rollback");
      console.log(
        plan.updates.length || plan.pattern.action === "update"
          ? "[post-urls] dry run: nothing written. Re-run with --apply."
          : "[post-urls] nothing to do.",
      );
      process.exitCode = plan.updates.length || plan.pattern.action === "update" ? 1 : 0;
      return;
    }

    if (plan.pattern.action === "update") {
      await client.query("update _emdash_collections set url_pattern = $1 where slug = 'posts'", [
        plan.pattern.to,
      ]);
    }
    for (const u of plan.updates) {
      // `published_at is not distinct from $3`: never overwrite a value that changed since it was read.
      const r = await client.query(
        "update ec_posts set published_at = $1 where id = $2 and published_at is not distinct from $3",
        [u.to, u.id, u.from],
      );
      if (r.rowCount !== 1)
        throw new Error(
          `post ${u.legacy_id} changed while the script ran; nothing was written, run it again`,
        );
      await client.query(
        "update content_taxonomies set published_at = $1 where collection = 'posts' and entry_id = $2",
        [u.to, u.id],
      );
    }
    await client.query("commit");
    console.log(
      `[post-urls] done: url_pattern ${plan.pattern.action === "update" ? "set" : "unchanged"}, ${plan.updates.length} published_at backfilled.`,
    );
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[post-urls] ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  });
}
