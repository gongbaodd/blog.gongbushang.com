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
  /** Delete the user and its OAuth links (and, by cascade, anything hanging off it). */
  deleteUser(id: string): Promise<void>;
  /** Delete only the Google links created at or after `since` for a pre-existing user. */
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

/**
 * Check the session the callback just started. `startedAt` is an ISO timestamp taken before the callback ran: a user row
 * with `createdAt >= startedAt` was created by this request (EmDash writes `new Date().toISOString()` in the same process).
 * Fails closed: any error refuses the sign-in.
 */
export async function enforceGoogleAllowlist(args: {
  session: SessionLike | undefined;
  store: GoogleSignInStore | undefined;
  allowlist: string | undefined;
  startedAt: string;
}): Promise<EnforceResult> {
  const { session, store, allowlist, startedAt } = args;
  try {
    if (!session) return { ok: false, reason: "no_user" };
    const userId = (await session.get("user"))?.id;
    if (!userId) return { ok: false, reason: "no_user" };
    if (!store) throw new Error("no database");
    const user = await store.getUser(userId);
    const createdHere = !!user && user.createdAt >= startedAt;
    let reason: "not_allowed" | "unverified" | undefined;
    if (!user || !isEmailAllowed(user.email, allowlist)) reason = "not_allowed";
    else if (createdHere && !user.emailVerified) reason = "unverified";
    if (!reason) return { ok: true };
    // Refused: leave nothing behind. A brand-new user goes away entirely; a pre-existing user (for example an invited
    // editor) stays, but loses any Google link this request created.
    if (user) {
      if (createdHere) await store.deleteUser(user.id);
      else await store.deleteOAuthLinksSince(user.id, startedAt);
    }
    await session.destroy();
    return { ok: false, reason };
  } catch {
    try {
      await session?.destroy();
    } catch {
      /* best effort: the redirect still carries no session */
    }
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
