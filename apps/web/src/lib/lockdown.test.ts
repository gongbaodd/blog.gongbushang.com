import { describe, expect, it } from "vitest";
import { isLockedPath } from "./lockdown";

describe("isLockedPath (D12 Worker lockdown)", () => {
  it.each([
    "/_emdash",
    "/_emdash/",
    "/_emdash/admin",
    "/_emdash/admin/setup",
    "/_emdash/api/auth/me",
    "/_emdash/api/setup/status",
    "/_EMDASH/admin",
    "/%5Femdash/api/auth/me",
    "/_emdash/api/%73etup",
    "//_emdash//api/manifest",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/_emdash/api/mcp",
    "/_emdash/%zz", // undecodable: refuse
  ])("locks %s", (p) => expect(isLockedPath(p)).toBe(true));

  it.each([
    "/",
    "/tech/2026/11/24/leetcode/",
    "/api/cards/latest.json",
    "/_astro/app.js",
    "/emdash-notes/",
    "/.well-known/security.txt",
    "/robots.txt",
  ])("serves %s", (p) => expect(isLockedPath(p)).toBe(false));
});
