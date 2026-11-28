/**
 * Allow-list and post-callback enforcement for "Sign in with Google" (GON-252).
 *
 * EmDash 1.6.0 ships the Google provider (`emdash/auth/providers/google`) but no email allow-list, and its callback route
 * (`/_emdash/api/auth/oauth/google/callback`) may auto-create a user (self-signup while setup is incomplete, or an enabled
 * `allowed_domains` row) and then starts a session. The email is only known after the token exchange inside that route, so
 * `outer.ts` lets the route run and calls `enforceGoogleAllowlist` on the result. A refused account ends with no session and
 * with no user (or Google link) created by that request.
 *
 * `email_verified`: EmDash's Google profile parser requires the boolean (`@emdash-cms/auth` oauth/providers/google.mjs) and
 * `findOrCreateOAuthUser` (dist/index.mjs) refuses to link an existing user unless it is true. A user created by this very
 * request is additionally refused here when its `email_verified` flag is 0, because the signup path does not insist on it.
 *
 * The database is reached through the small `GoogleSignInStore` interface.
 */

/** Login page the EmDash admin shows errors on (`?error=<code>&message=<text>`). */
export const LOGIN_ERROR_PATH = "/_emdash/admin/login";
export const GOOGLE_CALLBACK_PATH = "/_emdash/api/auth/oauth/google/callback";
export const DENIED_MESSAGE = "This Google account is not allowed to sign in to the admin.";

/** Comma-separated, trimmed, lowercased, de-duplicated. Empty or unset gives an empty list (denies everyone). */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return [...new Set(emails)];
}

/** Exact, case-insensitive match against the list. An empty list denies every account. */
export function isEmailAllowed(
  email: string | undefined | null,
  rawAllowlist: string | undefined | null,
): boolean {
  if (!email) return false;
  const list = parseAllowlist(rawAllowlist);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export interface StoredUser {
  id: string;
  email: string;
  emailVerified: boolean;
  /** ISO timestamp EmDash wrote when it created the row. */
  createdAt: string;
}

export interface GoogleSignInStore {
  getUser(id: string): Promise<StoredUser | null>;
  /** Users whose row was created at or after `since` (ISO). */
  listUsersCreatedSince(since: string): Promise<StoredUser[]>;
  /** Delete the user and its OAuth links (and, by cascade, anything hanging off it). */
  deleteUser(id: string): Promise<void>;
  /** Delete only the Google links created at or after `since` for a user. */
  deleteOAuthLinksSince(userId: string, since: string): Promise<void>;
}

export interface SessionLike {
  get(
    key: "user",
  ): Promise<{ id?: string } | undefined | null> | { id?: string } | undefined | null;
  destroy(): void | Promise<void>;
}

export type EnforceResult =
  | { ok: true }
  | { ok: false; reason: "not_allowed" | "unverified" | "no_user" | "error" };

/** Slack for the "created by this request" test: tolerates clock rounding, never used to delete an allow-listed user. */
export const CREATED_MARGIN_MS = 5000;

function isoMinus(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() - ms).toISOString();
}

/** What `outer.ts` should do with a request path. Fail closed: anything under the OAuth tree that is not Google is refused. */
export type OAuthPathClass = "google-callback" | "google-start" | "blocked" | "other";

const OAUTH_PREFIX = ["_emdash", "api", "auth", "oauth"];

/**
 * Classify a request path the way the router would see it, but wider: decode once (a malformed escape is `blocked`),
 * drop empty and `.` segments (double and trailing slashes), resolve `..`, compare case-insensitively. Anything that
 * reaches into `/_emdash/api/auth/oauth/` other than the Google start and callback routes is `blocked`.
 */
export function classifyOAuthPath(pathname: string): OAuthPathClass {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return "blocked";
  }
  const segs: string[] = [];
  for (const raw of decoded.split("/")) {
    const s = raw.trim().toLowerCase();
    if (s === "" || s === ".") continue;
    if (s === "..") {
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  if (!OAUTH_PREFIX.every((p, i) => segs[i] === p)) return "other";
  if (segs.length === 5 && segs[4] === "google") return "google-start";
  if (segs.length === 6 && segs[4] === "google" && segs[5] === "callback") return "google-callback";
  return "blocked";
}

/**
 * Run after EmDash's Google callback, whatever it answered (`successful` = it redirected away from the login error).
 *
 * 1. Sweep: any user created since `startedAt` whose email is not allow-listed is deleted with its links, so an error
 *    after creation (for example `finalizeSetup` failing) leaves no row behind. An allow-listed user is never deleted.
 * 2. If the callback started a session, the user must be allow-listed, and one created by this request must be verified.
 *
 * `startedAt` is an ISO timestamp taken before the callback ran. Fails closed: any error refuses the sign-in.
 */
export async function enforceGoogleAllowlist(args: {
  session: SessionLike | undefined;
  store: GoogleSignInStore | undefined;
  allowlist: string | undefined;
  startedAt: string;
  successful?: boolean;
}): Promise<EnforceResult> {
  const { session, store, allowlist, startedAt, successful = true } = args;
  const destroy = async () => {
    try {
      await session?.destroy();
    } catch {
      /* best effort: the redirect still carries no session */
    }
  };
  try {
    if (!store) throw new Error("no database");
    for (const u of await store.listUsersCreatedSince(startedAt)) {
      if (!isEmailAllowed(u.email, allowlist)) await store.deleteUser(u.id);
    }
    if (!successful) return { ok: true };
    if (!session) return { ok: false, reason: "no_user" };
    const userId = (await session.get("user"))?.id;
    if (!userId) return { ok: false, reason: "no_user" };
    const user = await store.getUser(userId);
    const allowed = !!user && isEmailAllowed(user.email, allowlist);
    const createdHere = !!user && user.createdAt >= isoMinus(startedAt, CREATED_MARGIN_MS);
    let reason: "not_allowed" | "unverified" | undefined;
    if (!allowed) reason = "not_allowed";
    else if (createdHere && !user!.emailVerified) reason = "unverified";
    if (!reason) return { ok: true };
    if (user) {
      // A not-allowed user created by this request goes away entirely (an allow-listed one is never deleted); otherwise only
      // the Google link this request created is removed (for example an invited editor stays).
      if (!allowed && createdHere) await store.deleteUser(user.id);
      else await store.deleteOAuthLinksSince(user.id, startedAt);
    }
    await destroy();
    return { ok: false, reason };
  } catch {
    await destroy();
    return { ok: false, reason: "error" };
  }
}

export function deniedRedirect(): Response {
  const location = `${LOGIN_ERROR_PATH}?error=oauth_denied&message=${encodeURIComponent(DENIED_MESSAGE)}`;
  return new Response(null, {
    status: 302,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

/** A callback result worth checking: the route redirected somewhere other than back to the login page with an error. */
export function isSuccessfulCallback(res: Response): boolean {
  if (res.status < 300 || res.status >= 400) return false;
  const location = res.headers.get("Location") ?? "";
  return !location.includes(LOGIN_ERROR_PATH);
}

/** Kysely-backed store over EmDash's `users` / `oauth_accounts` tables. `db` is `locals.emdash.db`. */
// oxlint-disable-next-line typescript/no-explicit-any -- structural: Kysely is not a direct dependency of this app
export function kyselyStore(db: any): GoogleSignInStore {
  return {
    async getUser(id) {
      const row = await db
        .selectFrom("users")
        .select(["id", "email", "email_verified", "created_at"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        emailVerified: Number(row.email_verified) === 1,
        createdAt: String(row.created_at),
      };
    },
    async listUsersCreatedSince(since) {
      const rows = await db
        .selectFrom("users")
        .select(["id", "email", "email_verified", "created_at"])
        .where("created_at", ">=", since)
        .execute();
      return rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        emailVerified: Number(row.email_verified) === 1,
        createdAt: String(row.created_at),
      }));
    },
    async deleteUser(id) {
      await db.deleteFrom("oauth_accounts").where("user_id", "=", id).execute();
      await db.deleteFrom("users").where("id", "=", id).execute();
    },
    async deleteOAuthLinksSince(userId, since) {
      await db
        .deleteFrom("oauth_accounts")
        .where("user_id", "=", userId)
        .where("provider", "=", "google")
        .where("created_at", ">=", since)
        .execute();
    },
  };
}
