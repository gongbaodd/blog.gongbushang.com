import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CALLBACK_PATH,
  isEmailAllowed,
  kyselyStore,
  parseAllowlist,
  type GoogleSignInStore,
  type StoredUser,
} from "./google-allowlist.ts";
import { createOuterMiddleware } from "./outer.ts";

describe("parseAllowlist / isEmailAllowed", () => {
  it("splits on commas, trims, lowercases, drops empties and duplicates", () => {
    expect(parseAllowlist(" Owner@Example.com , ,b@x.io,owner@example.com ")).toEqual([
      "owner@example.com",
      "b@x.io",
    ]);
  });

  it("is empty for unset, empty or blank input, and then denies everyone", () => {
    for (const raw of [undefined, null, "", "  ", " , ,"]) {
      expect(parseAllowlist(raw)).toEqual([]);
      expect(isEmailAllowed("owner@example.com", raw)).toBe(false);
    }
  });

  it("matches exact addresses case-insensitively, never by prefix, suffix or domain", () => {
    const raw = "Owner@Example.com";
    expect(isEmailAllowed("owner@example.com", raw)).toBe(true);
    expect(isEmailAllowed("OWNER@EXAMPLE.COM ", raw)).toBe(true);
    expect(isEmailAllowed("evil-owner@example.com", raw)).toBe(false);
    expect(isEmailAllowed("owner@example.com.evil.io", raw)).toBe(false);
    expect(isEmailAllowed("", raw)).toBe(false);
    expect(isEmailAllowed(undefined, raw)).toBe(false);
  });
});

/** In-memory stand-in for EmDash's users / oauth_accounts tables plus its Google callback (no network). */
function createFakeEmDash(seedUsers: StoredUser[] = []) {
  const users = new Map<string, StoredUser>(seedUsers.map((u) => [u.id, u]));
  const links: Array<{ userId: string; provider: string; createdAt: string }> = [];
  let seq = 0;
  let currentSession: { user?: { id: string } } = {};
  let destroyed = 0;

  const store: GoogleSignInStore = {
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async deleteUser(id) {
      users.delete(id);
      for (let i = links.length - 1; i >= 0; i--) if (links[i]!.userId === id) links.splice(i, 1);
    },
    async deleteOAuthLinksSince(userId, since) {
      for (let i = links.length - 1; i >= 0; i--)
        if (links[i]!.userId === userId && links[i]!.createdAt >= since) links.splice(i, 1);
    },
  };

  const session = {
    async get(_key: "user") {
      return currentSession.user;
    },
    destroy() {
      currentSession = {};
      destroyed++;
    },
  };

  /**
   * Mirrors EmDash 1.6.0 findOrCreateOAuthUser + the callback route: a verified profile links an existing user by email; with
   * `selfSignup` (setup incomplete or an enabled allowed_domains row) an unknown email creates a user, verified or not.
   */
  function googleCallback(
    profile: { email: string; verified: boolean },
    opts: { selfSignup: boolean },
  ): Response {
    const email = profile.email.toLowerCase();
    let user = [...users.values()].find((u) => u.email === email);
    const now = new Date().toISOString();
    if (user) {
      if (!profile.verified) return redirect("/_emdash/admin/login?error=signup_not_allowed");
      links.push({ userId: user.id, provider: "google", createdAt: now });
    } else if (opts.selfSignup) {
      user = { id: `u${++seq}`, email, emailVerified: profile.verified, createdAt: now };
      users.set(user.id, user);
      links.push({ userId: user.id, provider: "google", createdAt: now });
    } else {
      return redirect("/_emdash/admin/login?error=signup_not_allowed");
    }
    currentSession = { user: { id: user.id } };
    return redirect("/_emdash/admin");
  }

  return {
    users,
    links,
    store,
    session,
    googleCallback,
    hasSession: () => currentSession.user !== undefined,
    destroyed: () => destroyed,
  };
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function run(
  fake: ReturnType<typeof createFakeEmDash>,
  env: Record<string, string | undefined>,
  callback: () => Response,
  url = `http://localhost:4322${GOOGLE_CALLBACK_PATH}?code=c&state=s`,
) {
  const outer = createOuterMiddleware({
    getEnv: () => env,
    checkStartup: false,
    getGoogleStore: () => fake.store,
  });
  const next = vi.fn(async () => callback());
  const context = {
    url: new URL(url),
    request: new Request(url),
    session: fake.session,
    locals: {},
  };
  return {
    res: (outer as never as (c: unknown, n: () => Promise<Response>) => Promise<Response>)(
      context,
      next,
    ),
    next,
  };
}

const owner: StoredUser = {
  id: "owner",
  email: "owner@example.com",
  emailVerified: true,
  createdAt: "2020-01-01T00:00:00.000Z",
};
const editor: StoredUser = {
  id: "editor",
  email: "editor@example.com",
  emailVerified: true,
  createdAt: "2020-01-02T00:00:00.000Z",
};

describe("Google callback allow-list (outer middleware)", () => {
  it("keeps the session of an allow-listed, verified existing user", async () => {
    const fake = createFakeEmDash([owner]);
    const { res } = run(fake, { ADMIN_ALLOWED_EMAILS: "Owner@Example.com" }, () =>
      fake.googleCallback({ email: "owner@example.com", verified: true }, { selfSignup: false }),
    );
    const out = await res;
    expect(out.headers.get("Location")).toBe("/_emdash/admin");
    expect(fake.hasSession()).toBe(true);
    expect(fake.users.size).toBe(1);
  });

  it("refuses a verified account that is not on the list: no session, login error, nothing left behind", async () => {
    const fake = createFakeEmDash([owner]);
    // self-signup is open (setup incomplete or allowed_domains row): EmDash would create the stranger
    const { res } = run(fake, { ADMIN_ALLOWED_EMAILS: "owner@example.com" }, () =>
      fake.googleCallback({ email: "stranger@evil.io", verified: true }, { selfSignup: true }),
    );
    const out = await res;
    expect(out.status).toBe(302);
    const location = out.headers.get("Location") ?? "";
    expect(location).toContain("/_emdash/admin/login?error=oauth_denied&message=");
    expect(fake.hasSession()).toBe(false);
    expect(fake.destroyed()).toBe(1);
    // no leftover user and no leftover Google link
    expect([...fake.users.keys()]).toEqual(["owner"]);
    expect(fake.links).toEqual([]);
    expect(out.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("refuses an unverified email even when the address is on the list, and removes the user it created", async () => {
    const fake = createFakeEmDash();
    const { res } = run(fake, { ADMIN_ALLOWED_EMAILS: "owner@example.com" }, () =>
      fake.googleCallback({ email: "owner@example.com", verified: false }, { selfSignup: true }),
    );
    const out = await res;
    expect(out.headers.get("Location")).toContain("error=oauth_denied");
    expect(fake.hasSession()).toBe(false);
    expect(fake.users.size).toBe(0);
    expect(fake.links).toEqual([]);
  });

  it("denies every Google sign-in when ADMIN_ALLOWED_EMAILS is empty or unset", async () => {
    for (const env of [{ ADMIN_ALLOWED_EMAILS: "" }, {}]) {
      const fake = createFakeEmDash([owner]);
      const { res } = run(fake, env, () =>
        fake.googleCallback({ email: "owner@example.com", verified: true }, { selfSignup: false }),
      );
      const out = await res;
      expect(out.headers.get("Location")).toContain("error=oauth_denied");
      expect(fake.hasSession()).toBe(false);
    }
  });

  it("keeps a pre-existing refused user (invited editor) but removes the Google link the request created", async () => {
    const fake = createFakeEmDash([owner, editor]);
    const { res } = run(fake, { ADMIN_ALLOWED_EMAILS: "owner@example.com" }, () =>
      fake.googleCallback({ email: "editor@example.com", verified: true }, { selfSignup: false }),
    );
    const out = await res;
    expect(out.headers.get("Location")).toContain("error=oauth_denied");
    expect(fake.hasSession()).toBe(false);
    expect(fake.users.has("editor")).toBe(true);
    expect(fake.links).toEqual([]);
  });

  it("fails closed when the database cannot be reached", async () => {
    const fake = createFakeEmDash([owner]);
    const outer = createOuterMiddleware({
      getEnv: () => ({ ADMIN_ALLOWED_EMAILS: "owner@example.com" }),
      checkStartup: false,
      getGoogleStore: () => undefined,
    });
    fake.googleCallback({ email: "owner@example.com", verified: true }, { selfSignup: false });
    const url = `http://localhost:4322${GOOGLE_CALLBACK_PATH}?code=c&state=s`;
    const res = await (
      outer as never as (c: unknown, n: () => Promise<Response>) => Promise<Response>
    )(
      { url: new URL(url), request: new Request(url), session: fake.session, locals: {} },
      async () => redirect("/_emdash/admin"),
    );
    expect(res.headers.get("Location")).toContain("error=oauth_denied");
    expect(fake.hasSession()).toBe(false);
  });

  it("leaves EmDash's own error redirects and other paths alone", async () => {
    const fake = createFakeEmDash();
    const errorRedirect = run(fake, {}, () =>
      redirect("/_emdash/admin/login?error=invalid_state&message=x"),
    );
    expect((await errorRedirect.res).headers.get("Location")).toBe(
      "/_emdash/admin/login?error=invalid_state&message=x",
    );
    expect(fake.destroyed()).toBe(0);

    const other = run(fake, {}, () => new Response("ok"), "http://localhost:4322/_emdash/admin");
    expect(await (await other.res).text()).toBe("ok");
    expect(fake.destroyed()).toBe(0);
  });
});

describe("kyselyStore", () => {
  it("reads the user and deletes links before the user", async () => {
    const calls: string[] = [];
    const chain = (name: string, result?: unknown) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "where"]) q[m] = () => q;
      q.executeTakeFirst = async () => result;
      q.execute = async () => void calls.push(name);
      return q;
    };
    const db = {
      selectFrom: () =>
        chain("select", {
          id: "u",
          email: "a@b.c",
          email_verified: 1,
          created_at: "2026-01-01T00:00:00.000Z",
        }),
      deleteFrom: (t: string) => chain(`delete ${t}`),
    };
    const store = kyselyStore(db);
    expect(await store.getUser("u")).toEqual({
      id: "u",
      email: "a@b.c",
      emailVerified: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await store.deleteUser("u");
    expect(calls).toEqual(["delete oauth_accounts", "delete users"]);
  });
});
